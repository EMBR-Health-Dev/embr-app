import type { ConsentType, UserDto } from "@embr/types";

/** Items the person still needs to review, in display order. */
export function pendingConsentTypes(user: Pick<UserDto, "consents">): ConsentType[] {
  // An API that predates consent recording sends no `consents` at all
  // (web and API deploy independently). Treat that as "nothing to show"
  // rather than crashing: the API's own gate still decides access.
  if (!user.consents) return [];
  const order: ConsentType[] = ["TERMS", "PRIVACY", "HEALTH_PROCESSING"];
  return order.filter((type) => user.consents[type] !== "CURRENT");
}

export function needsConsentReview(user: Pick<UserDto, "consents"> | null): boolean {
  return user !== null && pendingConsentTypes(user).length > 0;
}

/**
 * Pages a person can always reach, whatever their consent state: the
 * consent screen itself, account settings (including deletion), data
 * export, and the signed-out auth pages. Everything else routes to the
 * consent screen until every item is current.
 */
const ALWAYS_REACHABLE = [
  "/",
  "/consent",
  "/settings",
  "/export",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

export function isConsentExempt(pathname: string): boolean {
  return ALWAYS_REACHABLE.includes(pathname);
}

export function consentHref(returnTo: string): string {
  return `/consent?redirect=${encodeURIComponent(returnTo)}`;
}
