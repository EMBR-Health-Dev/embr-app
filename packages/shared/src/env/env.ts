import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

/**
 * Validates process.env against a Zod schema and fails fast on boot if
 * anything required is missing or malformed, rather than surfacing a
 * confusing runtime error minutes (or days) later.
 */
export function loadEnv<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const merged = baseEnvSchema.merge(schema);
  const parsed = merged.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export { baseEnvSchema };
