/**
 * One-off: encrypts personal text written before application level
 * encryption existed (see lib/field-crypto.ts). Safe to run more than
 * once: values that are already encrypted are left as they are.
 *
 *   DATA_ENCRYPTION_KEY=... DATABASE_URL=... \
 *     pnpm --filter @embr/api exec tsx src/scripts/encrypt-existing.ts [--check]
 *
 * --check changes nothing. It counts, per field, how many stored values
 * are encrypted and how many are still plaintext, and decrypts every
 * encrypted value to prove the key reads it back. Without --check the
 * script encrypts what is left, then runs the same check.
 *
 * Output is counts only: no stored value, decrypted or not, is printed,
 * and errors are reduced to their name and code because a database
 * error can quote the values in its query.
 *
 * Uses the plain Prisma client on purpose, so it sees the stored values
 * rather than the decrypted ones the app's extended client returns.
 */
import { PrismaClient } from "../generated/prisma/index.js";
import {
  ENCRYPTED_FIELDS,
  decryptJson,
  decryptText,
  encryptRow,
  isEncrypted,
} from "../lib/field-crypto.js";

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany: (args: unknown) => Promise<Row[]>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

// Prisma delegate names for the models in ENCRYPTED_FIELDS, and whether
// the model has an @updatedAt column. Encrypting a value is not an edit,
// so the backfill writes updatedAt back unchanged (Prisma only sets it
// automatically when the update leaves it out).
const MODELS: Record<string, { delegate: string; hasUpdatedAt: boolean }> = {
  Note: { delegate: "note", hasUpdatedAt: true },
  SymptomLog: { delegate: "symptomLog", hasUpdatedAt: true },
  CycleEntry: { delegate: "cycleEntry", hasUpdatedAt: true },
  Treatment: { delegate: "treatment", hasUpdatedAt: true },
  ClinicalBrief: { delegate: "clinicalBrief", hasUpdatedAt: false },
};

const BATCH = 500;

type FieldCount = { stored: number; encrypted: number; plaintext: number; unreadable: number };

function delegateFor(db: PrismaClient, model: string): Delegate {
  return (db as unknown as Record<string, Delegate>)[MODELS[model]!.delegate]!;
}

async function* rowsOf(db: PrismaClient, model: string, select: Record<string, boolean>) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await delegateFor(db, model).findMany({
      select,
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) return;
    yield* rows;
    cursor = rows[rows.length - 1]!.id;
  }
}

/** Encrypts what is still plaintext. Returns rows written and rows skipped. */
async function encryptModel(db: PrismaClient, model: string) {
  const spec = ENCRYPTED_FIELDS[model]!;
  const textFields = spec.text ?? [];
  const fields = [...textFields, ...(spec.json ?? [])];
  const { hasUpdatedAt } = MODELS[model]!;
  const select = Object.fromEntries([
    ["id", true],
    ...fields.map((f) => [f, true]),
    ...(hasUpdatedAt ? [["updatedAt", true]] : []),
  ]);
  let written = 0;
  let skipped = 0;
  for await (const row of rowsOf(db, model, select)) {
    const pending = Object.fromEntries(
      fields
        .filter((f) => row[f] !== null && row[f] !== undefined && !isEncrypted(row[f]))
        .map((f) => [f, row[f]]),
    );
    if (Object.keys(pending).length === 0) continue;
    // Only write if the plaintext is still what was read, so an edit the
    // person saves meanwhile is never overwritten with the older text.
    // (JSON fields are BRIEF content, which the app never edits.)
    const where: Record<string, unknown> = { id: row.id };
    for (const f of textFields) if (f in pending) where[f] = pending[f];
    encryptRow(model, pending);
    if (hasUpdatedAt) pending.updatedAt = row.updatedAt;
    const { count } = await delegateFor(db, model).updateMany({ where, data: pending });
    if (count === 1) written += 1;
    else skipped += 1; // changed during the run; a rerun picks it up
  }
  return { written, skipped };
}

/** Counts stored values per field and decrypts every encrypted one. */
async function checkModel(db: PrismaClient, model: string) {
  const spec = ENCRYPTED_FIELDS[model]!;
  const counts: Record<string, FieldCount> = {};
  const fields = [
    ...(spec.text ?? []).map((f) => [f, "text"] as const),
    ...(spec.json ?? []).map((f) => [f, "json"] as const),
  ];
  for (const [f] of fields) counts[f] = { stored: 0, encrypted: 0, plaintext: 0, unreadable: 0 };
  const select = Object.fromEntries([["id", true], ...fields.map(([f]) => [f, true])]);
  for await (const row of rowsOf(db, model, select)) {
    for (const [f, kind] of fields) {
      const value = row[f];
      if (value === null || value === undefined) continue;
      const c = counts[f]!;
      c.stored += 1;
      if (!isEncrypted(value)) {
        c.plaintext += 1;
        continue;
      }
      c.encrypted += 1;
      try {
        if (kind === "text") decryptText(value, `${model}.${f}`);
        else decryptJson(value, `${model}.${f}`);
      } catch {
        c.unreadable += 1;
      }
    }
  }
  return counts;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const db = new PrismaClient();
  let problems = 0;
  try {
    if (!checkOnly) {
      for (const model of Object.keys(ENCRYPTED_FIELDS)) {
        const { written, skipped } = await encryptModel(db, model);
        console.warn(`encrypt ${model}: ${written} row(s) encrypted, ${skipped} skipped`);
        problems += skipped;
      }
    }
    for (const model of Object.keys(ENCRYPTED_FIELDS)) {
      for (const [field, c] of Object.entries(await checkModel(db, model))) {
        console.warn(
          `check ${model}.${field}: ${c.stored} stored, ${c.encrypted} encrypted, ` +
            `${c.plaintext} plaintext, ${c.unreadable} unreadable`,
        );
        // Plaintext is expected before the backfill, so only --check
        // tolerates it; an unreadable value is always a problem.
        problems += c.unreadable + (checkOnly ? 0 : c.plaintext);
      }
    }
  } finally {
    await db.$disconnect();
  }
  if (problems > 0) {
    console.error(`${problems} problem(s): see the lines above`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const e = err as { name?: string; code?: string };
  console.error(`failed: ${e?.name ?? "Error"}${e?.code ? ` ${e.code}` : ""}`);
  process.exit(1);
});
