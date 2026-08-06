import { Router, type Router as ExpressRouter } from "express";
import {
  acceptInviteSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  organizationMemberQuerySchema,
  orgTrendsQuerySchema,
  paginationQuerySchema,
  type AcceptInviteInput,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type OrganizationMemberQuery,
  type OrgTrendsQuery,
  type PaginationQuery,
} from "@embr/validation";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../lib/validate.js";
import { requireParam } from "../../lib/params.js";
import { requireAuth, requireOrgRole, requireRole } from "../auth/auth.middleware.js";
import { writeAuditLog } from "../auth/audit.js";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake, paginate } from "../../lib/pagination.js";
import { toOrganizationDto } from "./organization.mappers.js";
import { organizationService } from "./organization.service.js";

const router: ExpressRouter = Router();

router.use("/organizations", requireAuth());

/**
 * Platform-ADMIN-only, matching Milestone 7's read-only-ops-visibility
 * boundary: this is account-metadata-shaped (name/slug/seat count), the
 * same category of thing /admin/users already exposes, not a reach into
 * any organization's health data. Provisioning a new organization is
 * the same kind of operational action, gated the same way.
 */
router.get(
  "/organizations",
  requireRole("ADMIN"),
  validate(paginationQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as PaginationQuery;
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({ orderBy: { createdAt: "desc" }, ...toSkipTake(query) }),
      prisma.organization.count(),
    ]);
    const withCounts = await Promise.all(
      orgs.map(async (org) => ({
        org,
        count: await prisma.organizationMembership.count({ where: { organizationId: org.id } }),
      })),
    );
    const page = paginate(
      withCounts.map(({ org, count }) => toOrganizationDto(org, count)),
      total,
      query,
    );
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.post(
  "/organizations",
  requireRole("ADMIN"),
  validate(createOrganizationSchema),
  asyncHandler(async (req, res) => {
    const org = await organizationService.createOrganization(req.body as CreateOrganizationInput);
    await writeAuditLog(req, "ORG_CREATED", req.user!.sub, { organizationId: org.id });
    res.status(201).json({ data: org, requestId: req.requestId });
  }),
);

/**
 * How the frontend discovers which organization(s) the current user
 * belongs to, and as what role, without already knowing an
 * organizationId — registered before the :organizationId route below
 * so the literal "me" isn't swallowed by that param instead.
 */
router.get(
  "/organizations/me",
  asyncHandler(async (req, res) => {
    const memberships = await organizationService.getMyMemberships(req.user!.sub);
    res.status(200).json({ data: memberships, requestId: req.requestId });
  }),
);

router.get(
  "/organizations/:organizationId",
  requireOrgRole("ORG_ADMIN", "ORG_MEMBER"),
  asyncHandler(async (req, res) => {
    const org = await organizationService.getOrganization(requireParam(req, "organizationId"));
    res.status(200).json({ data: org, requestId: req.requestId });
  }),
);

/** Roster visibility, like org creation, is scoped to ORG_ADMIN only —
 * an ORG_MEMBER sees their own org exists (the route above) but not
 * who else is in it, until there's a real product reason to widen
 * that. */
router.get(
  "/organizations/:organizationId/members",
  requireOrgRole("ORG_ADMIN"),
  validate(organizationMemberQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await organizationService.listMembers(
      requireParam(req, "organizationId"),
      req.query as unknown as OrganizationMemberQuery,
    );
    res.status(200).json({ data: page, requestId: req.requestId });
  }),
);

router.post(
  "/organizations/:organizationId/invites",
  requireOrgRole("ORG_ADMIN"),
  validate(inviteMemberSchema),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const invite = await organizationService.inviteMember(
      organizationId,
      req.user!.sub,
      req.body as InviteMemberInput,
    );
    await writeAuditLog(req, "ORG_MEMBER_INVITED", req.user!.sub, {
      organizationId,
      invitedEmail: invite.email,
    });
    res.status(201).json({ data: invite, requestId: req.requestId });
  }),
);

/** Deliberately not org-scoped in the URL — the invite token itself
 * carries the organization, and requiring the caller to already know
 * the organizationId to accept an invite into it would be circular for
 * a brand-new user who's never seen this organization's id before. */
router.post(
  "/organizations/invites/accept",
  validate(acceptInviteSchema),
  asyncHandler(async (req, res) => {
    const { token } = req.body as AcceptInviteInput;
    await organizationService.acceptInvite(token, req.user!.sub, req.user!.email);
    await writeAuditLog(req, "ORG_MEMBER_JOINED", req.user!.sub);
    res.status(200).json({ data: { joined: true }, requestId: req.requestId });
  }),
);

router.delete(
  "/organizations/:organizationId/members/:userId",
  requireOrgRole("ORG_ADMIN"),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const revokedUserId = requireParam(req, "userId");
    await organizationService.revokeMember(organizationId, revokedUserId);
    await writeAuditLog(req, "ORG_MEMBER_REVOKED", req.user!.sub, {
      organizationId,
      revokedUserId,
    });
    res.status(204).send();
  }),
);

/**
 * Anonymized, cohort-level only — see organization.service.ts for the
 * k-anonymity floor this applies before returning any category counts.
 * ORG_ADMIN-gated like the roster: this is the one place org-level
 * visibility into health-adjacent data exists at all, and it's built
 * so that "adjacent" never becomes "individual."
 */
router.get(
  "/organizations/:organizationId/trends/symptom-frequency",
  requireOrgRole("ORG_ADMIN"),
  validate(orgTrendsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const organizationId = requireParam(req, "organizationId");
    const data = await organizationService.symptomFrequency(
      organizationId,
      req.query as unknown as OrgTrendsQuery,
    );
    await writeAuditLog(req, "ORG_AGGREGATE_TRENDS_VIEWED", req.user!.sub, {
      organizationId,
    });
    res.status(200).json({ data, requestId: req.requestId });
  }),
);

export { router as organizationRouter };
