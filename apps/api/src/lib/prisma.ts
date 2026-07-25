import { PrismaClient } from "../generated/prisma/index.js";

/**
 * Singleton PrismaClient. In dev, `tsx watch` re-executes this module on
 * every reload; without caching on globalThis we'd exhaust Postgres
 * connections within minutes of active development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
