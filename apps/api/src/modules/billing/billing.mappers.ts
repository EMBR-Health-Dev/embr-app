import type { Organization } from "../../generated/prisma/index.js";
import type { OrgBillingStatusDto, StripeSubscriptionStatus } from "@embr/types";
import { isBillingConfigured } from "../../lib/stripe.js";

export function toOrgBillingStatusDto(org: Organization, seatsUsed: number): OrgBillingStatusDto {
  return {
    hasStripeCustomer: org.stripeCustomerId !== null,
    subscriptionStatus: org.subscriptionStatus as StripeSubscriptionStatus | null,
    seatLimit: org.seatLimit,
    seatsUsed,
    currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
    billingEnabled: isBillingConfigured(),
  };
}
