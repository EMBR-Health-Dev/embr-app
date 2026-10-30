import { z } from "zod";

/**
 * Shared Zod primitives so every app validates pagination, IDs, etc.
 * identically. Domain schemas (RegisterUserSchema, LogSymptomSchema, ...)
 * are added here starting Milestone 2/3 and re-exported for both the API
 * (request validation) and the frontend (React Hook Form resolvers).
 */

/**
 * An array schema that rejects an oversized array before any element is
 * parsed. Zod 3 validates every element even when `.max()` already
 * failed, and keeps an issue object per bad element
 * (GHSA-mrhx-c7xc-m3w5, no patched 3.x release), so a 1 MB body of junk
 * elements costs about 160 MB of heap. The length check runs first, so
 * that body costs one issue. Use this for every array in a request body.
 */
export function boundedArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z
    .custom<unknown[]>((value) => Array.isArray(value) && value.length <= max, {
      message: `Expected an array of at most ${max} items`,
    })
    .pipe(z.array(item).max(max));
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
