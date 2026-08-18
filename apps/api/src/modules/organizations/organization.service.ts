import { AppError } from "@embr/shared";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  OrganizationMemberQuery,
  OrgTrendsQuery,
} from "@embr/validation";
import type {
  MyOrganizationMembershipDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrgActivationDto,
  OrgSymptomFrequencyDto,
  PaginatedResponse,
  SymptomCategory,
} from "@embr/types";
import { env } from "../../config/env.js";
import { organizationRepository } from "./organization.repository.js";
import {
  toMyOrganizationMembershipDto,
  toOrganizationDto,
  toOrganizationInviteDto,
  toOrganizationMemberDto,
} from "./organization.mappers.js";
import { authRepository } from "../auth/auth.repository.js";
import {
  ACTIVATION_WINDOW_DAYS,
  computeActivatedUserIds,
  computeWeeklyActiveUserIds,
  toPercentage,
} from "./organization.activation.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import { sendOrganizationInviteEmail } from "../auth/mailer.js";

export const organizationService = {
  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationDto> {
    const existing = await organizationRepository.findOrganizationBySlug(input.slug);
    if (existing) {
      throw AppError.conflict("An organization with this slug already exists");
    }
    const org = await organizationRepository.createOrganization(input);
    return toOrganizationDto(org, 0);
  },

  async listMyMemberships(userId: string): Promise<MyOrganizationMembershipDto[]> {
    const memberships = await organizationRepository.listMembershipsForUser(userId);
    return memberships.map(toMyOrganizationMembershipDto);
  },

  async getOrganization(organizationId: string): Promise<OrganizationDto> {
    const org = await organizationRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");
    const memberCount = await organizationRepository.countMembers(organizationId);
    return toOrganizationDto(org, memberCount);
  },

  async listMembers(
    organizationId: string,
    query: OrganizationMemberQuery,
  ): Promise<PaginatedResponse<OrganizationMemberDto>> {
    const { items, total } = await organizationRepository.listMembers(organizationId, query);
    return {
      items: items.map(toOrganizationMemberDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  },

  async inviteMember(
    organizationId: string,
    invitedByUserId: string,
    input: InviteMemberInput,
  ): Promise<OrganizationInviteDto> {
    const org = await organizationRepository.findOrganizationById(organizationId);
    if (!org) throw AppError.notFound("Organization");

    if (org.seatLimit !== null) {
      const memberCount = await organizationRepository.countMembers(organizationId);
      if (memberCount >= org.seatLimit) {
        throw AppError.conflict("This organization has no remaining seats");
      }
    }

    const existingUser = await authRepository.findUserByEmail(input.email);
    if (existingUser) {
      const existingMembership = await organizationRepository.findMembership(
        organizationId,
        existingUser.id,
      );
      if (existingMembership) {
        throw AppError.conflict("This person is already a member of the organization");
      }
    }

    const token = generateOpaqueToken();
    const invite = await organizationRepository.createInvite({
      organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedByUserId,
      expiresAt: new Date(Date.now() + env.ORG_INVITE_TTL_SECONDS * 1000),
    });

    await sendOrganizationInviteEmail(input.email, org.name, token);
    return toOrganizationInviteDto(invite);
  },

  /**
   * Accepting an invite requires an authenticated user whose account
   * email matches the invited email — deliberately not "whoever holds
   * the link" alone, since (unlike email verification) this action
   * grants organization-scoped access rather than just confirming
   * ownership of an inbox. A logged-out visitor is sent through
   * login/register first; the invite token survives that round trip.
   */
  async acceptInvite(token: string, userId: string, userEmail: string): Promise<void> {
    const invite = await organizationRepository.findValidInvite(hashToken(token));
    if (!invite) {
      throw AppError.validation("This invitation is invalid or has expired");
    }
    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw AppError.forbidden("This invitation was sent to a different email address");
    }

    const existingMembership = await organizationRepository.findMembership(
      invite.organizationId,
      userId,
    );
    if (existingMembership) {
      await organizationRepository.consumeInvite(invite.id);
      throw AppError.conflict("You are already a member of this organization");
    }

    await organizationRepository.createMembership(invite.organizationId, userId, invite.role);
    await organizationRepository.consumeInvite(invite.id);
  },

  async revokeMember(organizationId: string, targetUserId: string): Promise<void> {
    const result = await organizationRepository.revokeMembership(organizationId, targetUserId);
    if (result.count === 0) {
      throw AppError.notFound("Organization member");
    }
  },

  /**
   * Applies the k-anonymity floor before returning anything
   * category-level: below ORG_TRENDS_MIN_COHORT_SIZE active loggers,
   * `categories` is empty and `suppressed` is true, regardless of how
   * "harmless" a single category count might look in isolation — the
   * floor is on cohort size, not on any individual number derived from
   * it, so there's no path where a caller can infer the real count by
   * requesting narrower and narrower date ranges.
   */
  async symptomFrequency(
    organizationId: string,
    query: OrgTrendsQuery,
  ): Promise<OrgSymptomFrequencyDto> {
    const memberUserIds = await organizationRepository.memberUserIds(organizationId);
    const { cohortSize, categories } = await organizationRepository.symptomFrequencyForMembers(
      memberUserIds,
      query,
    );

    if (cohortSize < env.ORG_TRENDS_MIN_COHORT_SIZE) {
      return { suppressed: true, cohortSize, categories: [] };
    }

    return {
      suppressed: false,
      cohortSize,
      categories: categories
        .map((row) => ({ category: row.category as SymptomCategory, count: row.count }))
        .sort((a, b) => b.count - a.count),
    };
  },

  /**
   * See organization.activation.ts for the authoritative business
   * definitions of "eligible," "activated," and "weekly active" — this
   * method is the orchestration layer only, not where those
   * definitions live.
   *
   * The k-anonymity floor is applied to eligibleCount, deliberately
   * before activatedCount/weeklyActiveCount are ever computed — unlike
   * symptomFrequency above (which gates on an already-activity-filtered
   * cohort size), gating here on the *raw* membership count is what
   * correctly suppresses a small org with zero activated employees,
   * not just a small org with a nonzero one. A 4-person org showing
   * "0 of 4 activated" is exactly as identifying as "3 of 4."
   */
  async activation(organizationId: string, asOf: Date = new Date()): Promise<OrgActivationDto> {
    const memberships = await organizationRepository.membershipsForActivation(organizationId);
    const eligibleCount = memberships.length;

    if (eligibleCount < env.ORG_TRENDS_MIN_COHORT_SIZE) {
      return {
        suppressed: true,
        eligibleCount,
        activatedCount: null,
        activationPercentage: null,
        weeklyActiveCount: null,
        weeklyActivePercentage: null,
        activationWindowDays: ACTIVATION_WINDOW_DAYS,
        asOf: asOf.toISOString(),
      };
    }

    const eligibleUserIds = memberships.map((m) => m.userId);
    const earliestJoinDate = memberships.reduce(
      (earliest, m) => (m.createdAt < earliest ? m.createdAt : earliest),
      memberships[0]!.createdAt,
    );
    // The weekly-active window can reach further back than any
    // membership's own join date if asOf is far enough in the future
    // of "now" — fetching from whichever of the two is earlier keeps
    // both computations correctly bounded from a single query.
    const weeklyWindowStart = new Date(asOf);
    weeklyWindowStart.setDate(weeklyWindowStart.getDate() - 7);
    const earliestNeeded =
      earliestJoinDate < weeklyWindowStart ? earliestJoinDate : weeklyWindowStart;

    const { symptomActivity, cycleActivity } = await organizationRepository.activityForMembers(
      eligibleUserIds,
      earliestNeeded,
    );
    const activity = [...symptomActivity, ...cycleActivity];

    const activatedUserIds = computeActivatedUserIds(memberships, activity);
    const weeklyActiveUserIds = computeWeeklyActiveUserIds(eligibleUserIds, activity, asOf);

    return {
      suppressed: false,
      eligibleCount,
      activatedCount: activatedUserIds.size,
      activationPercentage: toPercentage(activatedUserIds.size, eligibleCount),
      weeklyActiveCount: weeklyActiveUserIds.size,
      weeklyActivePercentage: toPercentage(weeklyActiveUserIds.size, eligibleCount),
      activationWindowDays: ACTIVATION_WINDOW_DAYS,
      asOf: asOf.toISOString(),
    };
  },
};
