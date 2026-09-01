import type Stripe from "stripe";
import type { StripeSubscriptionStatus } from "../../generated/prisma/index.js";
import { AppError } from "@embr/shared";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { getStripeClient } from "../../lib/stripe.js";
import { billingRepository } from "./billing.repository.js";

/** Every value Stripe's Subscription.status can take, uppercased —
 * matches the Prisma enum 1:1 (see schema.prisma's doc comment on
 * StripeSubscriptionStatus). A status this doesn't recognize means
 * Stripe's API added a new value since this was written, which is a
 * real problem worth a loud error, not a value silently coerced to
 * something wrong. */
function toSubscriptionStatus(status: Stripe.Subscription.Status): StripeSubscriptionStatus {
  const upper = status.toUpperCase() as StripeSubscriptionStatus;
  const known: readonly StripeSubscriptionStatus[] = [
    "INCOMPLETE",
    "INCOMPLETE_EXPIRED",
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELED",
    "UNPAID",
    "PAUSED",
  ];
  if (!known.includes(upper)) {
    throw AppError.internal(`Unrecognized Stripe subscription status: ${status}`);
  }
  return upper;
}

/**
 * Verifies the webhook's signature and parses the payload into a real
 * Stripe.Event. Throws AppError.unauthorized on a bad/missing
 * signature — becomes a 401 via the global error handler, which is a
 * non-2xx either way as far as Stripe's retry logic cares (Stripe
 * retries any non-2xx response with backoff for up to three days,
 * regardless of which 4xx/5xx it was); 401 specifically communicates
 * "we didn't trust this request," which is the accurate reason,
 * clearer in logs than a generic 400 would be.
 *
 * `payload` must be the raw, unparsed request body — see app.ts's
 * express.raw() mounting for this route specifically, ahead of the
 * global express.json(). A JSON.parse-then-reserialize of the body
 * would not reproduce the exact bytes Stripe signed, and signature
 * verification would fail for every request, not just forged ones.
 */
export function verifyWebhookSignature(payload: Buffer, signatureHeader: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw AppError.serviceUnavailable("Billing webhook is not configured on this deployment");
  }
  const stripe = getStripeClient();
  try {
    return stripe.webhooks.constructEvent(payload, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw AppError.unauthorized(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Applies one already-verified Stripe event. Idempotent: a duplicate
 * delivery of the same event id (Stripe's docs guarantee at-least-once,
 * not exactly-once) is recorded once and every later delivery is a
 * no-op — see billing.repository.ts's recordWebhookEventIfNew.
 *
 * Only three event types are handled — see docs/MILESTONES.md's entry
 * for why checkout.session.completed is deliberately NOT one of them:
 * the subscription-lifecycle events below are Stripe's own recommended
 * source of truth for subscription state, and checkout.session.completed
 * fires for one-time-payment Checkout sessions too, which this app
 * never creates but would otherwise need to defensively distinguish.
 * Every other event type is acknowledged (200) and ignored — Stripe
 * treats "we don't care about this one" and "we handled it" the same
 * way, and there is no dashboard-configurable event allowlist worth
 * maintaining in code for a single-price, single-mode integration this
 * size.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<void> {
  const isNew = await billingRepository.recordWebhookEventIfNew(event.id, event.type);
  if (!isNew) {
    logger.info({ eventId: event.id, type: event.type }, "billing webhook: duplicate, skipping");
    return;
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    default:
      logger.info({ eventId: event.id, type: event.type }, "billing webhook: unhandled type");
  }
}

async function organizationForCustomer(customerId: string) {
  const org = await billingRepository.findOrganizationByStripeCustomerId(customerId);
  if (!org) {
    // Not an error worth failing the webhook over (Stripe would retry
    // indefinitely) — most plausibly a customer created directly in
    // the Stripe dashboard rather than through createCheckoutSession,
    // which is the only place stripeCustomerId gets set. Logged loudly
    // so it's visible, not silently swallowed.
    logger.warn({ customerId }, "billing webhook: no organization found for Stripe customer");
    return null;
  }
  return org;
}

/**
 * Subscription quantity is read from the first (and, by this
 * integration's own design — see createCheckoutSession's single
 * line_item — only) subscription item. A multi-item subscription
 * (add-ons, multiple prices) is out of scope; if that's ever added,
 * this needs to change to sum or otherwise combine quantities, not
 * silently read the wrong one.
 */
async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const org = await organizationForCustomer(customerId);
  if (!org) return;

  const item = subscription.items.data[0];
  if (!item) {
    logger.error(
      { subscriptionId: subscription.id },
      "billing webhook: subscription has no items, skipping seat-count update",
    );
    return;
  }

  await billingRepository.applySubscriptionState(org.id, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: toSubscriptionStatus(subscription.status),
    seatLimit: item.quantity ?? org.seatLimit ?? 0,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  });
}

async function applySubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const org = await organizationForCustomer(customerId);
  if (!org) return;

  await billingRepository.markSubscriptionCanceled(org.id, "CANCELED");
}
