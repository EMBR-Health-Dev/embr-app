import { PrismaClient } from "../generated/prisma/index.js";
import { ENCRYPTED_FIELDS, decryptRow, encryptRow } from "./field-crypto.js";

export { Prisma } from "../generated/prisma/index.js";

/**
 * Singleton PrismaClient. In dev, `tsx watch` re-executes this module on
 * every reload; without caching on globalThis we'd exhaust Postgres
 * connections within minutes of active development.
 */
type Row = Record<string, unknown>;

/** Copies a write payload (or each row of a list) before encrypting, so
 * the caller's own object never ends up holding ciphertext. */
function encryptedCopy(model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => encryptedCopy(model, row));
  if (!data || typeof data !== "object") return data;
  const copy = { ...(data as Row) };
  encryptRow(model, copy);
  return copy;
}

function decryptResult(model: string, result: unknown): unknown {
  if (Array.isArray(result)) result.forEach((row) => decryptRow(model, row));
  else decryptRow(model, result);
  return result;
}

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Personal text is encrypted on the way in and decrypted on the way
  // out for the models in ENCRYPTED_FIELDS (see field-crypto.ts), so no
  // repository handles ciphertext and none can forget to encrypt.
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          if (!ENCRYPTED_FIELDS[model]) return query(args);
          const a = { ...(args as Row) };
          if ("data" in a) a.data = encryptedCopy(model, a.data);
          if ("create" in a) a.create = encryptedCopy(model, a.create);
          if ("update" in a) a.update = encryptedCopy(model, a.update);
          return decryptResult(model, await query(a as typeof args));
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** The client an interactive `prisma.$transaction(async (tx) => …)` hands
 * its callback: the extended client, so encryption applies inside
 * transactions too. Use it instead of Prisma.TransactionClient. */
export type TransactionClient = Omit<
  ExtendedPrismaClient,
  "$extends" | "$transaction" | "$connect" | "$disconnect" | "$on"
>;
