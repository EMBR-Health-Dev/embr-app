import type { NextFunction, Request, Response } from "express";
import { AppError } from "@embr/shared";
import { consentService } from "./consent.service.js";

/**
 * Must run after requireAuth(). Blocks health-data routes (symptoms,
 * cycle, context, treatments, trends, reflections, briefs, onboarding)
 * unless every consent item — Terms, Privacy and health processing —
 * is current. This is the actual control; the clients' redirect to the
 * consent screen is only UX.
 *
 * Deliberately NOT applied to: auth/account/security routes, consent
 * management, data export and account deletion — a person must always
 * be able to review their choices, take their data, or leave.
 *
 * Re-reads consent state from the database on every call, for the same
 * reason requireVerifiedEmail does: a person who accepts or withdraws
 * mid-session is treated accordingly on their very next request.
 */
export function requireCurrentConsent() {
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      try {
        if (!req.user) {
          return next(AppError.unauthorized());
        }
        const states = await consentService.statesFor(req.user.sub);
        if (!consentService.isFullyCurrent(states)) {
          return next(AppError.consentRequired());
        }
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}
