import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application level encryption for the personal text EMBR stores: what a
 * person writes in her own words (notes, notebook pages, treatment names)
 * and the stored wording of each BRIEF. Backups are encrypted already
 * (scripts/db-backup.sh); this protects the same text in the live database
 * from anyone who can read it (an operator, a leaked connection string, a
 * stray query or log), whatever the disk underneath does.
 *
 * AES-256-GCM with a fresh 96-bit nonce per value. The model and field
 * name are bound in as associated data, so a ciphertext copied into a
 * different column fails to decrypt instead of being read as that column.
 *
 * Stored format: `enc:v1:<iv>.<tag>.<ciphertext>`, each part base64url.
 * Values without the prefix are rows written before encryption existed;
 * they are read as they are until scripts/encrypt-existing.ts rewrites
 * them, so turning this on needs no downtime.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  const decoded = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (decoded.length !== 32) {
    // Never fall back to writing plaintext: a missing key is a deploy
    // error, not a reason to store health text unprotected.
    throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  cachedKey = decoded;
  return cachedKey;
}

/** For tests that swap the key between cases. */
export function resetFieldKeyCache(): void {
  cachedKey = null;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptText(plaintext: string, context: string): string {
  if (isEncrypted(plaintext)) return plaintext; // never encrypt twice
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

export function decryptText(stored: string, context: string): string {
  if (!isEncrypted(stored)) return stored; // written before encryption
  const [ivPart, tagPart, ctPart] = stored.slice(PREFIX.length).split(".");
  if (ivPart === undefined || tagPart === undefined || ctPart === undefined) {
    throw new Error(`Malformed encrypted value for ${context}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** A JSON value is stored as the encrypted string of its JSON text. */
export function encryptJson(value: unknown, context: string): string {
  return encryptText(JSON.stringify(value), context);
}

export function decryptJson(stored: unknown, context: string): unknown {
  return isEncrypted(stored) ? JSON.parse(decryptText(stored, context)) : stored;
}

/**
 * The fields encrypted at rest, by Prisma model. Text fields hold a
 * string; JSON fields hold any JSON value and are stored as one encrypted
 * string. Nothing here is ever filtered, sorted or searched in SQL, which
 * random nonce encryption would make impossible: keep it that way.
 */
export const ENCRYPTED_FIELDS: Record<string, { text?: string[]; json?: string[] }> = {
  Note: { text: ["title", "body"] },
  SymptomLog: { text: ["notes"] },
  CycleEntry: { text: ["notes"] },
  Treatment: { text: ["name", "notes"] },
  ClinicalBrief: { text: ["aiNarrative"], json: ["treatmentSummary", "aiDiscussionTopics"] },
};

type Row = Record<string, unknown>;

/** Encrypts the listed fields of one write payload, in place. */
export function encryptRow(model: string, data: Row | undefined | null): void {
  const spec = ENCRYPTED_FIELDS[model];
  if (!spec || !data || typeof data !== "object") return;
  for (const field of spec.text ?? []) {
    const value = data[field];
    // Prisma also accepts `{ set: value }` for scalar updates.
    if (typeof value === "string") data[field] = encryptText(value, `${model}.${field}`);
    else if (value && typeof value === "object" && typeof (value as Row).set === "string") {
      (value as Row).set = encryptText((value as Row).set as string, `${model}.${field}`);
    }
  }
  for (const field of spec.json ?? []) {
    if (field in data && data[field] !== undefined && !isEncrypted(data[field])) {
      data[field] = encryptJson(data[field], `${model}.${field}`);
    }
  }
}

/** Decrypts the listed fields of one result row, in place. */
export function decryptRow(model: string, row: unknown): void {
  const spec = ENCRYPTED_FIELDS[model];
  if (!spec || !row || typeof row !== "object") return;
  const r = row as Row;
  for (const field of spec.text ?? []) {
    if (typeof r[field] === "string")
      r[field] = decryptText(r[field] as string, `${model}.${field}`);
  }
  for (const field of spec.json ?? []) {
    if (field in r) r[field] = decryptJson(r[field], `${model}.${field}`);
  }
}
