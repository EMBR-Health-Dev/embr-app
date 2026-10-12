/**
 * One-off: encrypts personal text written before application level
 * encryption existed (see lib/field-crypto.ts). Safe to run more than
 * once: values that are already encrypted are left as they are.
 *
 *   DATA_ENCRYPTION_KEY=... DATABASE_URL=... \
 *     pnpm --filter @embr/api exec tsx src/scripts/encrypt-existing.ts
 *
 * Uses the plain Prisma client on purpose, so it sees the stored values
 * rather than the decrypted ones the app's extended client returns.
 */
import { PrismaClient } from "../generated/prisma/index.js";
import { ENCRYPTED_FIELDS, encryptRow, isEncrypted } from "../lib/field-crypto.js";

type Row = Record<string, unknown> & { id: string };

// Prisma delegate names for the models in ENCRYPTED_FIELDS.
const DELEGATES: Record<string, string> = {
  Note: "note",
  SymptomLog: "symptomLog",
  CycleEntry: "cycleEntry",
  Treatment: "treatment",
  ClinicalBrief: "clinicalBrief",
};

const BATCH = 500;

async function main() {
  const db = new PrismaClient();
  try {
    for (const [model, spec] of Object.entries(ENCRYPTED_FIELDS)) {
      const fields = [...(spec.text ?? []), ...(spec.json ?? [])];
      const delegate = (
        db as unknown as Record<
          string,
          {
            findMany: (args: unknown) => Promise<Row[]>;
            update: (args: unknown) => Promise<unknown>;
          }
        >
      )[DELEGATES[model]!]!;
      const select = Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]);
      let cursor: string | undefined;
      let updated = 0;
      for (;;) {
        const rows = await delegate.findMany({
          select,
          orderBy: { id: "asc" },
          take: BATCH,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (rows.length === 0) break;
        for (const row of rows) {
          const pending = Object.fromEntries(
            fields
              .filter((f) => row[f] !== null && row[f] !== undefined && !isEncrypted(row[f]))
              .map((f) => [f, row[f]]),
          );
          if (Object.keys(pending).length === 0) continue;
          encryptRow(model, pending);
          await delegate.update({ where: { id: row.id }, data: pending });
          updated += 1;
        }
        cursor = rows[rows.length - 1]!.id;
      }
      console.warn(`${model}: encrypted ${updated} row(s)`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
