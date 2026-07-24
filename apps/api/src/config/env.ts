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

  // ---- Auth (Milestone 2) ----
  APP_URL: z.string().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60),
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

export const env = loadEnv(apiEnvSchema);
export type ApiEnv = typeof env;
