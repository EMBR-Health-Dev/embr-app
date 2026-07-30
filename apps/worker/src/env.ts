import { loadEnv } from "@embr/shared";
import { z } from "zod";

export const env = loadEnv(
  z.object({
    REDIS_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    // Optional by design — no-op when unset, same pattern as apps/api.
    SENTRY_DSN: z.string().url().optional(),
  }),
);
