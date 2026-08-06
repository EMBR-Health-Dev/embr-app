import { prisma } from "../../lib/prisma.js";

export const ssoRepository = {
  findByOrganizationId(organizationId: string) {
    return prisma.organizationSsoConnection.findUnique({ where: { organizationId } });
  },

  /** Keyed by email domain rather than organizationId — this is how
   * `/auth/sso/start` finds which org (if any) a visitor should
   * authenticate against before they're logged in at all, from nothing
   * but the email they typed in. Only an `enabled` connection is
   * eligible; a configured-but-disabled one behaves as if it doesn't
   * exist for this lookup. */
  findEnabledByEmailDomain(domain: string) {
    return prisma.organizationSsoConnection.findFirst({
      where: { allowedEmailDomain: domain, enabled: true },
    });
  },

  findById(id: string) {
    return prisma.organizationSsoConnection.findUnique({ where: { id } });
  },

  /** Full-replace upsert, matching the validation schema's full-replace
   * PUT contract — there's no partial-update path for this resource. */
  upsert(
    organizationId: string,
    data: {
      issuerUrl: string;
      clientId: string;
      encryptedClientSecret: string;
      allowedEmailDomain: string;
      enabled: boolean;
    },
  ) {
    return prisma.organizationSsoConnection.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
  },
};
