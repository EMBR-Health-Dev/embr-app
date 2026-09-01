import { AppError } from "@embr/shared";
import type { CreateCheckoutSessionInput } from "@embr/validation";
import type { OrgBillingStatusDto } from "@embr/types";
import { env } from "../../config/env.js";
import { getStripeClient, isBillingConfigured } from "../../lib/stripe.js";
import { billingRepository } from "./billing.repository.js";
import { toOrgBillingStatusDto } from "./billing.mappers.js";

/** Every route in this module calls this first — see billing.routes.ts
 * — so a deployment that hasn't configured Stripe yet gets one
 * consistent, clean 503 everywhere rather than a Stripe SDK throwing
 * "no API key provided" from three different call sites in three
 * different shapes. */
function requireBillingConfigured(): void {
  if (!isBillingConfigured()) {
    throw AppError.serviceUnavailable("Billing is not configured on this deployment");
  }
}

export const billingService = {
  /**
   * Creates (or reuses) a Stripe Checkout session for a seat-based
   * subscription. The Stripe customer is created — and immediately
   * persisted to the org — before the session, not deferred to
   * checkout.session.completed: by the time any webhook fires, the org
   * already has stripeCustomerId set, so every subscription-lifecycle
   * webhook can look up its org by customer id alone (see
   * billing.webhook.ts) rather than needing metadata propagated
   * through Stripe's own object graph.
   */
  async createCheckoutSession(
    organizationId: string,
    input: CreateCheckoutSessionInput,
  ): Promise<{ url: string }> {
    requireBillingConfigured();
    const org = await billingRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");

    const stripe = getStripeClient();
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organizationId: org.id },
      });
      stripeCustomerId = customer.id;
      await billingRepository.setStripeCustomerId(organizationId, stripeCustomerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: env.STRIPE_SEAT_PRICE_ID, quantity: input.seats }],
      success_url: `${env.APP_URL}/organizations/${organizationId}/billing?checkout=success`,
      cancel_url: `${env.APP_URL}/organizations/${organizationId}/billing?checkout=cancelled`,
      client_reference_id: organizationId,
    });

    if (!session.url) {
      // Stripe always returns a url for a Checkout Session created this
      // way; this is a defensive guard against an SDK/API contract
      // change, not a case that's expected to trigger in practice.
      throw AppError.internal("Stripe did not return a Checkout session URL");
    }
    return { url: session.url };
  },

  /**
   * Creates a Stripe Billing Portal session — lets an ORG_ADMIN change
   * seat quantity, update payment method, or view invoices without
   * EMBR building any of that UI itself. Requires an existing Stripe
   * customer (there's nothing to manage before a first checkout), so
   * this deliberately 409s rather than silently creating one — a
   * portal session for a customer with no subscription is a confusing
   * empty screen, not a useful entry point.
   */
  async createPortalSession(organizationId: string): Promise<{ url: string }> {
    requireBillingConfigured();
    const org = await billingRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");
    if (!org.stripeCustomerId) {
      throw AppError.conflict("This organization has no billing history yet");
    }

    const stripe = getStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${env.APP_URL}/organizations/${organizationId}/billing`,
    });
    return { url: portalSession.url };
  },

  /**
   * Billing status is readable even when billing isn't configured on
   * this deployment (billingEnabled: false in the response tells the
   * caller why) and even when the org has never touched Stripe
   * (hasStripeCustomer: false, everything else null) — unlike
   * checkout/portal session creation, there's a real, useful all-null
   * response here rather than only an error state.
   */
  async getBillingStatus(organizationId: string): Promise<OrgBillingStatusDto> {
    const org = await billingRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");
    const seatsUsed = await billingRepository.countMembers(organizationId);
    return toOrgBillingStatusDto(org, seatsUsed);
  },
};
