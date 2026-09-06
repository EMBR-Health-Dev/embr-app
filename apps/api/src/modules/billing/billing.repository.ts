import type { Prisma, StripeSubscriptionStatus } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";

export interface SubscriptionStateUpdate {
  stripeSubscriptionId: string;
  subscriptionStatus: StripeSubscriptionStatus;
  seatLimit: number;
  currentPeriodEnd: Date;
}

/** Accepted by every function below the "Webhook processing" marker:
 * either the top-level client or an open transaction's client. Always
 * a transaction client in practice today (see
 * runIdempotentWebhookTransaction) — kept generic rather than
 * re-typed to Prisma.TransactionClient specifically so a future
 * non-transactional caller isn't forced to fake one. */
type Db = typeof prisma | Prisma.TransactionClient;

export const billingRepository = {
  findOrganizationById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  countMembers(organizationId: string) {
    return prisma.organizationMembership.count({ where: { organizationId } });
  },

  setStripeCustomerId(organizationId: string, stripeCustomerId: string) {
    return prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId },
    });
  },

  // ---- Webhook processing — every function below runs inside the
  // one transaction runIdempotentWebhookTransaction opens, and takes
  // that transaction's client explicitly rather than closing over the
  // top-level `prisma` singleton. See that function's own doc comment
  // for why: recording an event as processed and actually applying it
  // must succeed or fail together. ----

  /** Webhook events key off the Stripe customer id, not organizationId
   * — see billing.webhook.ts for why (the event payload has no other
   * reliable link back to our org). */
  findOrganizationByStripeCustomerId(db: Db, stripeCustomerId: string) {
    return db.organization.findUnique({ where: { stripeCustomerId } });
  },

  /** Applied on customer.subscription.created/updated — sets the org's
   * seatLimit directly from the subscription's item quantity, so the
   * existing invite-time enforcement in organization.service.ts picks
   * it up with no further wiring. */
  applySubscriptionState(db: Db, organizationId: string, update: SubscriptionStateUpdate) {
    return db.organization.update({
      where: { id: organizationId },
      data: {
        stripeSubscriptionId: update.stripeSubscriptionId,
        subscriptionStatus: update.subscriptionStatus,
        seatLimit: update.seatLimit,
        currentPeriodEnd: update.currentPeriodEnd,
      },
    });
  },

  /** Applied on customer.subscription.deleted — deliberately leaves
   * seatLimit untouched (see the model's doc comment and the schema
   * migration notes): a canceled subscription doesn't retroactively
   * evict existing members, and whether it should block new invites
   * going forward is exactly what subscriptionStatus != ACTIVE is for,
   * not a reason to zero out a number that has its own independent
   * meaning. */
  markSubscriptionCanceled(db: Db, organizationId: string, status: StripeSubscriptionStatus) {
    return db.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: status },
    });
  },

  /** Idempotency check-and-record for webhook delivery, done as a
   * single `create` relying on the primary key's uniqueness rather
   * than a separate findUnique-then-create — the failure mode of two
   * concurrent deliveries of the same event both passing a prior
   * findUnique check is exactly what this needs to prevent, and a
   * unique-constraint violation on create is the correct atomic way to
   * do that. Returns false (already processed) if a StripeWebhookEvent
   * row with this id already exists, true if this call was the one
   * that created it.
   */
  async recordWebhookEventIfNew(db: Db, eventId: string, type: string): Promise<boolean> {
    try {
      await db.stripeWebhookEvent.create({ data: { id: eventId, type } });
      return true;
    } catch (err) {
      // Prisma's unique-constraint violation code — any other error
      // should still surface, not be swallowed as "already processed."
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return false;
      }
      throw err;
    }
  },

  /**
   * Opens the one transaction that spans both the idempotency record
   * and the actual event processing `work` performs. This is the fix
   * for a real, confirmed bug: recordWebhookEventIfNew used to be a
   * separate, already-committed write, called before the type-specific
   * processing (status conversion, the final organization.update) ever
   * ran. If that later processing threw for any reason — an
   * unrecognized Stripe status (toSubscriptionStatus's own explicit
   * throw), a transient DB error, anything — the event was already
   * permanently marked processed. Stripe's automatic retry of that
   * same event (triggered by the resulting non-2xx response) would
   * then be silently treated as a duplicate and skipped by the exact
   * idempotency check meant to prevent double-processing — losing the
   * subscription-state update with no further retry possible and no
   * error surfaced afterward. Wrapping both in one transaction means a
   * throw anywhere in `work` rolls back the idempotency record too, so
   * a genuine retry is correctly treated as a first attempt.
   *
   * Returns null (work never ran) when the event was already recorded
   * by an earlier, successful delivery.
   */
  async runIdempotentWebhookTransaction<T>(
    eventId: string,
    eventType: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T | null> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const isNew = await billingRepository.recordWebhookEventIfNew(tx, eventId, eventType);
      if (!isNew) return null;
      return work(tx);
    });
  },
};
