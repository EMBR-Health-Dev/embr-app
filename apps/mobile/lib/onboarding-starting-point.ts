import { startingPointMessageKey as sharedStartingPointMessageKey } from "@embr/onboarding";

// Mobile's i18next setup has no per-screen namespace scoping the way
// web's next-intl useTranslations("Dashboard") does (see
// apps/web/src/lib/onboarding-starting-point.ts) — locales/en.json
// nests this copy under a flat "home" key instead, so the shared,
// unprefixed key needs "home." prepended here to resolve.
export function startingPointMessageKey(jobToBeDone: string | null): string | null {
  const key = sharedStartingPointMessageKey(jobToBeDone);
  return key ? `home.${key}` : null;
}
