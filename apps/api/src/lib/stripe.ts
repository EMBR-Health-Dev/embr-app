import Stripe from "stripe";
import { env } from "../config/env.js";

/**
 * Lazily-constructed Stripe client, cached on globalThis the same way
 * prisma.ts caches PrismaClient — `tsx watch` re-executes this module
 * on every dev reload, and constructing a fresh Stripe client each time
 * is harmless but wasteful.
 *
 * Deliberately a function, not a top-level `export const stripe = ...`:
 * STRIPE_SECRET_KEY is optional (see config/env.ts's doc comment on
 * why), so constructing the client eagerly at import time would either
 * throw on every boot without it configured, or need its own
 * unconfigured-no-op mode duplicating what billing.service.ts already
 * has to check anyway. Call sites call `getStripeClient()` only once
 * they've already confirmed billing is configured.
 */
const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export function isBillingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_SEAT_PRICE_ID);
}

/** Throws if called before confirming `isBillingConfigured()` — callers
 * (billing.service.ts, billing.webhook.ts) are expected to check first
 * and surface a clean 503, not let this throw reach the client as an
 * unhandled 500. */
export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("getStripeClient() called without STRIPE_SECRET_KEY configured");
  }
  if (!globalForStripe.stripe) {
    globalForStripe.stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return globalForStripe.stripe;
}
