import type { StripeSubscriptionStatus } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";

export interface SubscriptionStateUpdate {
  stripeSubscriptionId: string;
  subscriptionStatus: StripeSubscriptionStatus;
  seatLimit: number;
  currentPeriodEnd: Date;
}

export const billingRepository = {
  findOrganizationById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  countMembers(organizationId: string) {
    return prisma.organizationMembership.count({ where: { organizationId } });
  },

  /** Webhook events key off the Stripe customer id, not organizationId
   * — see billing.webhook.ts for why (the event payload has no other
   * reliable link back to our org). */
  findOrganizationByStripeCustomerId(stripeCustomerId: string) {
    return prisma.organization.findUnique({ where: { stripeCustomerId } });
  },

  setStripeCustomerId(organizationId: string, stripeCustomerId: string) {
    return prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId },
    });
  },

  /** Applied on customer.subscription.created/updated — sets the org's
   * seatLimit directly from the subscription's item quantity, so the
   * existing invite-time enforcement in organization.service.ts picks
   * it up with no further wiring. */
  applySubscriptionState(organizationId: string, update: SubscriptionStateUpdate) {
    return prisma.organization.update({
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
  markSubscriptionCanceled(organizationId: string, status: StripeSubscriptionStatus) {
    return prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: status },
    });
  },

  /**
   * Idempotency check-and-record for webhook delivery, done as a
   * single `create` relying on the primary key's uniqueness rather
   * than a separate findUnique-then-create — the failure mode of two
   * concurrent deliveries of the same event both passing a prior
   * findUnique check is exactly what this needs to prevent, and a
   * unique-constraint violation on create is the correct atomic way to
   * do that. Returns false (already processed) if a StripeWebhookEvent
   * row with this id already exists, true if this call was the one
   * that created it.
   */
  async recordWebhookEventIfNew(eventId: string, type: string): Promise<boolean> {
    try {
      await prisma.stripeWebhookEvent.create({ data: { id: eventId, type } });
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
};
