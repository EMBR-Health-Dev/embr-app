import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Parses `req[part]` against `schema` and replaces it with the parsed
 * (and, for e.g. pagination/email-lowercasing, coerced/transformed)
 * value. Throws the raw ZodError on failure — the global error handler
 * (see error-handler.ts) already knows how to turn a ZodError into the
 * standard `{ error: { code: VALIDATION_ERROR, details: [...] } }` shape,
 * so route code never needs to catch validation errors itself.
 */
export function validate(schema: ZodTypeAny, part: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req[part] = schema.parse(req[part]);
      next();
    } catch (err) {
      next(err);
    }
  };
}
