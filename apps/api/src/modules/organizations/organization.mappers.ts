import type {
  Organization,
  OrganizationInvite,
  OrganizationMembership,
  User,
} from "../../generated/prisma/index.js";
import type {
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrgRole,
  MyOrganizationMembershipDto,
} from "@embr/types";

export function toOrganizationDto(org: Organization, memberCount: number): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    seatLimit: org.seatLimit,
    memberCount,
    createdAt: org.createdAt.toISOString(),
  };
}

export function toOrganizationMemberDto(
  membership: OrganizationMembership & { user: Pick<User, "id" | "email"> },
): OrganizationMemberDto {
  return {
    id: membership.id,
    userId: membership.user.id,
    email: membership.user.email,
    role: membership.role as OrgRole,
    joinedAt: membership.createdAt.toISOString(),
  };
}

export function toOrganizationInviteDto(invite: OrganizationInvite): OrganizationInviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as OrgRole,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export function toMyOrganizationMembershipDto(
  membership: OrganizationMembership & { organization: Organization },
): MyOrganizationMembershipDto {
  return {
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    role: membership.role as OrgRole,
  };
}
