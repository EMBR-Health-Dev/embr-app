import { loadEnv } from "@embr/shared";
import { z } from "zod";

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default("no-reply@embr.health"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export const env = loadEnv(apiEnvSchema);
export type ApiEnv = typeof env;
