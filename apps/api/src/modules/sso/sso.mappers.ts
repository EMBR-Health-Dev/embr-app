import type { OrganizationSsoConnection } from "../../generated/prisma/index.js";
import type { SsoConnectionDto } from "@embr/types";

/** The encrypted secret never leaves the server, in either encrypted or
 * plaintext form — `hasClientSecret` is all a config UI needs to show
 * "a secret is set" without round-tripping anything sensitive. */
export function toSsoConnectionDto(connection: OrganizationSsoConnection): SsoConnectionDto {
  return {
    id: connection.id,
    protocol: connection.protocol,
    issuerUrl: connection.issuerUrl,
    clientId: connection.clientId,
    hasClientSecret: connection.encryptedClientSecret.length > 0,
    allowedEmailDomain: connection.allowedEmailDomain,
    enabled: connection.enabled,
    enforced: connection.enforced,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
