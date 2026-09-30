import { CONSENT_TYPES, LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";

/**
 * Every consent item at its current version — what a person who ticks
 * every box on the registration form sends. Used by tests that exercise
 * health features (which require all items to be current) rather than
 * consent itself; consent behaviour has its own tests in consent.test.ts.
 */
export const CURRENT_CONSENTS = CONSENT_TYPES.map((type) => ({
  type,
  version: LEGAL_DOCUMENT_VERSIONS[type],
}));
