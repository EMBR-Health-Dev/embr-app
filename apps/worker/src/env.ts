import { loadEnv } from "@embr/shared";
import { z } from "zod";

export const env = loadEnv(
  z.object({
    REDIS_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
  }),
);
