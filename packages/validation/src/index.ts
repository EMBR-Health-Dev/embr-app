import { z } from "zod";

/**
 * Shared Zod primitives so every app validates pagination, IDs, etc.
 * identically. Domain schemas (RegisterUserSchema, LogSymptomSchema, ...)
 * are added here starting Milestone 2/3 and re-exported for both the API
 * (request validation) and the frontend (React Hook Form resolvers).
 */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
