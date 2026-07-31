import { AppError } from "@embr/shared";
import type { Request } from "express";

/**
 * Reads a route parameter as the plain string every route in this app
 * actually guarantees.
 *
 * @types/express types every value under `req.params` as `string | string[]`
 * — Express only ever produces an array there for a param name that
 * repeats within the same path (e.g. `/:id/nested/:id`), which no route in
 * this app does, but the type can't express that per-route guarantee, so
 * it's `string | string[]` everywhere regardless.
 *
 * The fix used ad hoc across routes (Milestone 12) was `req.params.x as
 * string` — this centralizes that into one place and backs it with an
 * actual runtime check, rather than asserting the type away unchecked at
 * every call site.
 *
 * Throws `AppError.internal` (500), not a 400/404: a missing or
 * array-shaped value here means the route path and this call disagree
 * about what params it declares, which is a routing bug to fix, not
 * something a well-formed client request could trigger.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw AppError.internal(
      `Expected route parameter "${name}" to be a string, got: ${JSON.stringify(value)}`,
    );
  }
  return value;
}
