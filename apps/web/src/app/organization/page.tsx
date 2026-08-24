"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  MyOrganizationMembershipDto,
  OrgBillingStatusDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
  SsoConnectionDto,
  StripeSubscriptionStatus,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

const TRENDS_WINDOW_DAYS = 90;
// Mirrors createCheckoutSessionSchema's own z.number().int().positive().max(100000)
// in @embr/validation — the frontend clamp exists to avoid a pointless
// round-trip 400 for an obviously out-of-range value, not to replace
// that server-side check, which remains authoritative either way.
const MAX_CHECKOUT_SEATS = 100000;

// A subscription in one of these two states has genuinely ended —
// nothing left to manage seat-quantity-wise through the Portal, so
// this is the one signal that decides whether the "start a
// subscription" checkout flow shows. Every other status (including
// PAST_DUE, INCOMPLETE, UNPAID) still represents a live Stripe
// subscription object, and starting a second one via Checkout would
// just create a duplicate — the Portal, not Checkout, is where those
// get resolved.
const TERMINAL_SUBSCRIPTION_STATUSES = new Set<StripeSubscriptionStatus>([
  "CANCELED",
  "INCOMPLETE_EXPIRED",
]);

function hasLiveSubscription(status: StripeSubscriptionStatus | null): boolean {
  return status !== null && !TERMINAL_SUBSCRIPTION_STATUSES.has(status);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function OrganizationPage() {
  const t = useTranslations("Organization");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [memberships, setMemberships] = useState<MyOrganizationMembershipDto[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [org, setOrg] = useState<OrganizationDto | null>(null);
  const [roster, setRoster] = useState<OrganizationMemberDto[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  // Self-service "leave organization" — deliberately separate state
  // from revokingUserId above: revoke is an admin action on someone
  // else's membership (roster section), leave is the caller acting on
  // their own (its own section, never mixed into the roster list).
  const [leaveConfirmingOrgId, setLeaveConfirmingOrgId] = useState<string | null>(null);
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null);
  // Paired rather than a bare string: with more than one organization
  // listed (member view) or switched between (admin view), an error
  // must stay attached to the org that produced it, not render under
  // every org in the list.
  const [leaveError, setLeaveError] = useState<{ organizationId: string; message: string } | null>(
    null,
  );

  const [frequency, setFrequency] = useState<OrgSymptomFrequencyDto | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ORG_ADMIN" | "ORG_MEMBER">("ORG_MEMBER");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const [ssoConnection, setSsoConnection] = useState<SsoConnectionDto | null>(null);
  const [ssoLoading, setSsoLoading] = useState(true);
  const [ssoIssuerUrl, setSsoIssuerUrl] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoClientSecret, setSsoClientSecret] = useState("");
  const [ssoDomain, setSsoDomain] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoSuccess, setSsoSuccess] = useState<string | null>(null);
  const [ssoSaving, setSsoSaving] = useState(false);

  const [billing, setBilling] = useState<OrgBillingStatusDto | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingLoadError, setBillingLoadError] = useState<string | null>(null);
  const [checkoutSeats, setCheckoutSeats] = useState<number | "">(1);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Discover which org(s) this user administers — there's no other way
  // to learn an organizationId from the frontend, same reasoning as
  // the API route's own doc comment.
  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => {
        setMemberships(rows);
        const firstAdminOrg = rows.find((m) => m.role === "ORG_ADMIN");
        if (firstAdminOrg) setSelectedOrgId(firstAdminOrg.organizationId);
      })
      .catch(() => setMemberships([]));
  }, [user]);

  useEffect(() => {
    if (!selectedOrgId) return;
    // Matches React's own documented fetch-on-mount pattern — see the
    // equivalent suppression in apps/admin/dashboard/page.tsx for the
    // full reasoning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRosterLoading(true);
    setTrendsLoading(true);

    api.organizations
      .get(selectedOrgId)
      .then(setOrg)
      .catch(() => setOrg(null));

    api.organizations.members
      .list(selectedOrgId, { pageSize: 100 })
      .then((page) => setRoster(page.items))
      .finally(() => setRosterLoading(false));

    api.organizations.trends
      .symptomFrequency(selectedOrgId, { from: daysAgoIso(TRENDS_WINDOW_DAYS) })
      .then(setFrequency)
      .finally(() => setTrendsLoading(false));

    setSsoLoading(true);
    api.organizations.sso
      .get(selectedOrgId)
      .then((connection) => {
        setSsoConnection(connection);
        if (connection) {
          setSsoIssuerUrl(connection.issuerUrl);
          setSsoClientId(connection.clientId);
          setSsoDomain(connection.allowedEmailDomain);
          setSsoEnabled(connection.enabled);
        }
      })
      .catch(() => setSsoConnection(null))
      .finally(() => setSsoLoading(false));

    setBillingLoading(true);
    setBillingLoadError(null);
    api.organizations.billing
      .get(selectedOrgId)
      .then((status) => {
        setBilling(status);
        setCheckoutSeats(status.seatLimit ?? status.seatsUsed ?? 1);
      })
      .catch((err) => {
        setBilling(null);
        setBillingLoadError(err instanceof ApiError ? err.message : t("billing.loadError"));
      })
      .finally(() => setBillingLoading(false));
    // `t` is included because this effect now calls it (billing load-
    // error fallback) — next-intl's useTranslations returns a stable
    // reference per locale, so this doesn't introduce a re-fetch loop,
    // it just satisfies exhaustive-deps honestly rather than
    // suppressing it.
  }, [selectedOrgId, t]);

  async function revokeMember(userId: string) {
    if (!selectedOrgId) return;
    setRevokingUserId(userId);
    try {
      await api.organizations.members.revoke(selectedOrgId, userId);
      setRoster((prev) => prev.filter((m) => m.userId !== userId));
      setOrg((prev) => (prev ? { ...prev, memberCount: prev.memberCount - 1 } : prev));
    } finally {
      setRevokingUserId(null);
    }
  }

  /**
   * Leaving redirects to /dashboard on success rather than staying on
   * a page that no longer applies to this org — same reasoning as
   * settings.tsx's password-change/account-deletion redirects. Removes
   * the org from `memberships` first (not just relying on the
   * navigation) so nothing on this page can flash stale state in the
   * instant between the request resolving and the route changing.
   */
  async function leaveOrganization(organizationId: string) {
    setLeaveConfirmingOrgId(null);
    setLeaveError(null);
    setLeavingOrgId(organizationId);
    try {
      await api.organizations.leave(organizationId);
      setMemberships((prev) =>
        prev ? prev.filter((m) => m.organizationId !== organizationId) : prev,
      );
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? t("leaveLastAdminError")
          : err instanceof ApiError
            ? err.message
            : t("leaveError");
      setLeaveError({ organizationId, message });
      setLeavingOrgId(null);
    }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (!selectedOrgId) return;
    setInviteError(null);
    setInviteSuccess(null);
    setInviting(true);
    try {
      const invite = await api.organizations.invites.create(selectedOrgId, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteSuccess(t("inviteSuccess", { email: invite.email }));
      setInviteEmail("");
      setInviteRole("ORG_MEMBER");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : t("inviteError"));
    } finally {
      setInviting(false);
    }
  }

  async function saveSso(e: FormEvent) {
    e.preventDefault();
    if (!selectedOrgId) return;
    setSsoError(null);
    setSsoSuccess(null);
    setSsoSaving(true);
    try {
      const connection = await api.organizations.sso.upsert(selectedOrgId, {
        issuerUrl: ssoIssuerUrl.trim(),
        clientId: ssoClientId.trim(),
        clientSecret: ssoClientSecret,
        allowedEmailDomain: ssoDomain.trim(),
        enabled: ssoEnabled,
      });
      setSsoConnection(connection);
      // The secret is never echoed back — clearing it here (rather than
      // leaving whatever was typed) matches that it's genuinely gone
      // from the client the moment the request completes.
      setSsoClientSecret("");
      setSsoSuccess(t("ssoSaveSuccess"));
    } catch (err) {
      setSsoError(err instanceof ApiError ? err.message : t("ssoSaveError"));
    } finally {
      setSsoSaving(false);
    }
  }

  async function startCheckout() {
    if (!selectedOrgId) return;
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      // Clamped here, not on every keystroke — an onChange that forces
      // a minimum immediately fights a user trying to clear the field
      // and type a fresh number (the field would snap back to 1 mid-
      // edit and the new digits would land next to it instead of
      // replacing it). checkoutSeats is allowed to sit at "" or a
      // fractional/out-of-range value while someone's actively
      // editing; only the actual submission needs a real, valid,
      // in-range integer — floored (a number input's decimal point
      // isn't blocked by typing, only by step-mismatch validity,
      // which nothing here enforces) and clamped to the same bounds
      // the backend's own schema enforces.
      const seats: number =
        checkoutSeats === ""
          ? 1
          : Math.min(MAX_CHECKOUT_SEATS, Math.max(1, Math.floor(checkoutSeats)));
      const { url } = await api.organizations.billing.createCheckoutSession(selectedOrgId, {
        seats,
      });
      // Full-page navigation to a Stripe-hosted URL — never processed
      // in-app, same reasoning as the doc comment on api.ts's
      // createCheckoutSession. Deliberately not resetting
      // checkingOut on success: the page is navigating away, so the
      // disabled/pending button state staying put until that happens
      // is correct, not a bug.
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : t("billing.genericError"));
      setCheckingOut(false);
    }
  }

  async function openPortal() {
    if (!selectedOrgId) return;
    setPortalError(null);
    setOpeningPortal(true);
    try {
      const { url } = await api.organizations.billing.createPortalSession(selectedOrgId);
      window.location.href = url;
    } catch (err) {
      setPortalError(err instanceof ApiError ? err.message : t("billing.genericError"));
      setOpeningPortal(false);
    }
  }

  if (loading || !user || memberships === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const adminOrgs = memberships.filter((m) => m.role === "ORG_ADMIN");

  if (memberships.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-teal underline underline-offset-2"
          >
            {t("backToDashboard")}
          </Link>
        </header>
        <p className="mt-8 text-sm text-navy/60">{t("notAMember")}</p>
      </main>
    );
  }

  // A plain ORG_MEMBER (not an admin of anything) still needs a way to
  // see and leave their membership — the admin management UI below
  // (roster, invites, SSO, billing) genuinely doesn't apply to them,
  // but "nothing to manage" isn't the same as "nothing to show."
  if (adminOrgs.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-teal underline underline-offset-2"
          >
            {t("backToDashboard")}
          </Link>
        </header>
        <p className="mt-8 text-sm text-navy/60">{t("notAnAdmin")}</p>

        <ul className="mt-6 divide-y divide-navy/10">
          {memberships.map((m) => (
            <li key={m.organizationId} className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-navy">{m.organizationName}</p>
                  <p className="text-sm text-navy/50">
                    {t("roleMember")} · {t("joined")} {new Date(m.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                {leaveConfirmingOrgId === m.organizationId ? (
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-navy/60">{t("confirmLeaveMessage")}</span>
                    <button
                      onClick={() => void leaveOrganization(m.organizationId)}
                      disabled={leavingOrgId === m.organizationId}
                      className="font-medium text-red-600 underline underline-offset-2 disabled:opacity-50"
                    >
                      {leavingOrgId === m.organizationId ? t("leaving") : t("leaveOrganization")}
                    </button>
                    <button
                      onClick={() => setLeaveConfirmingOrgId(null)}
                      disabled={leavingOrgId === m.organizationId}
                      className="text-navy/60 underline underline-offset-2 disabled:opacity-50"
                    >
                      {t("cancel")}
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setLeaveConfirmingOrgId(m.organizationId)}
                    className="text-sm font-medium text-red-600 underline underline-offset-2"
                  >
                    {t("leaveOrganization")}
                  </button>
                )}
              </div>
              {leaveError && leaveError.organizationId === m.organizationId && (
                <p className="mt-2 text-sm text-red-600">{leaveError.message}</p>
              )}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      {adminOrgs.length > 1 && (
        <label className="mt-6 flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">{t("managingLabel")}</span>
          <select
            value={selectedOrgId ?? ""}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
          >
            {adminOrgs.map((m) => (
              <option key={m.organizationId} value={m.organizationId}>
                {m.organizationName}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg text-navy">{org?.name ?? "…"}</h2>
        {org && (
          <p className="mt-1 text-sm text-navy/60">
            {t("memberCount", { count: org.memberCount })}
            {org.seatLimit !== null && t("ofSeats", { count: org.seatLimit })} ·{" "}
            <code>{org.slug}</code>
          </p>
        )}
      </section>

      {/* Your own membership — self-service leave. Deliberately its
          own section, separate from Billing/Invite/Roster/SSO below:
          this acts on the caller's own membership, never someone
          else's, and isn't an admin management capability (an
          ORG_ADMIN viewing this page can leave the org they
          administer the same way a plain member can). */}
      {(() => {
        const myMembership = memberships.find((m) => m.organizationId === selectedOrgId);
        if (!myMembership || !selectedOrgId) return null;
        const orgId = selectedOrgId;
        return (
          <section className="mt-8 rounded border border-red-200 p-5">
            <h2 className="font-display text-lg text-navy">{t("yourMembership")}</h2>
            <p className="mt-1 text-sm text-navy/60">
              {myMembership.role === "ORG_ADMIN" ? t("roleAdmin") : t("roleMember")} · {t("joined")}{" "}
              {new Date(myMembership.joinedAt).toLocaleDateString()}
            </p>
            <p className="mt-3 text-sm text-navy/60">{t("leaveDescription")}</p>

            {leaveConfirmingOrgId === orgId ? (
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="text-navy/60">{t("confirmLeaveMessage")}</span>
                <button
                  onClick={() => void leaveOrganization(orgId)}
                  disabled={leavingOrgId === orgId}
                  className="font-medium text-red-600 underline underline-offset-2 disabled:opacity-50"
                >
                  {leavingOrgId === orgId ? t("leaving") : t("leaveOrganization")}
                </button>
                <button
                  onClick={() => setLeaveConfirmingOrgId(null)}
                  disabled={leavingOrgId === orgId}
                  className="text-navy/60 underline underline-offset-2 disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLeaveConfirmingOrgId(orgId)}
                className="mt-3 text-sm font-medium text-red-600 underline underline-offset-2"
              >
                {t("leaveOrganization")}
              </button>
            )}

            {leaveError && leaveError.organizationId === orgId && (
              <p className="mt-2 text-sm text-red-600">{leaveError.message}</p>
            )}
          </section>
        );
      })()}

      {/* Billing. */}
      <section className="mt-8 rounded border border-navy/10 p-5">
        <h2 className="font-display text-lg text-navy">{t("billing.title")}</h2>

        {billingLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : !billing ? (
          <p className="mt-3 text-sm text-red-600">{billingLoadError ?? t("billing.loadError")}</p>
        ) : !billing.billingEnabled ? (
          <p className="mt-3 text-sm text-navy/60">{t("billing.notConfigured")}</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-navy/50">{t("billing.statusLabel")}</dt>
                <dd className="font-medium text-navy">
                  {billing.subscriptionStatus
                    ? tEnum(`subscriptionStatus.${billing.subscriptionStatus}`)
                    : t("billing.noSubscription")}
                </dd>
              </div>
              <div>
                <dt className="text-navy/50">{t("billing.seatsLabel")}</dt>
                <dd className="font-medium text-navy">
                  {billing.seatsUsed}
                  {billing.seatLimit !== null && ` / ${billing.seatLimit}`}
                </dd>
              </div>
              {billing.currentPeriodEnd && (
                <div>
                  <dt className="text-navy/50">{t("billing.renewsLabel")}</dt>
                  <dd className="font-medium text-navy">
                    {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>

            {billing.subscriptionStatus === "PAST_DUE" && (
              <p className="mt-3 text-sm text-red-600">{t("billing.pastDueWarning")}</p>
            )}

            {!hasLiveSubscription(billing.subscriptionStatus) && (
              <div className="mt-5">
                <p className="text-sm text-navy/60">{t("billing.startDescription")}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field
                    label={t("billing.seatsInputLabel")}
                    type="number"
                    min={1}
                    max={MAX_CHECKOUT_SEATS}
                    step={1}
                    value={checkoutSeats}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCheckoutSeats(raw === "" ? "" : Number(raw));
                    }}
                  />
                  <Button onClick={startCheckout} disabled={checkingOut}>
                    {checkingOut ? t("billing.startingCheckout") : t("billing.startSubscription")}
                  </Button>
                </div>
                {checkoutError && <p className="mt-2 text-sm text-red-600">{checkoutError}</p>}
              </div>
            )}

            {billing.hasStripeCustomer && (
              <div className="mt-5">
                <p className="text-sm text-navy/60">{t("billing.manageDescription")}</p>
                <Button
                  variant="ghost"
                  onClick={openPortal}
                  disabled={openingPortal}
                  className="mt-3"
                >
                  {openingPortal ? t("billing.opening") : t("billing.manageBilling")}
                </Button>
                {portalError && <p className="mt-2 text-sm text-red-600">{portalError}</p>}
              </div>
            )}
          </>
        )}
      </section>

      {/* Invite. */}
      <section className="mt-8 rounded border border-navy/10 p-5">
        <h2 className="font-display text-lg text-navy">{t("inviteSomeone")}</h2>
        <form onSubmit={sendInvite} className="mt-4 flex flex-col gap-4" noValidate>
          <Field
            label={t("emailLabel")}
            type="email"
            autoComplete="off"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">{t("roleLabel")}</span>
            <div className="flex gap-2">
              {(["ORG_MEMBER", "ORG_ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 rounded-sm border px-3 py-2 text-sm ${
                    inviteRole === r ? "border-navy bg-navy text-bone" : "border-navy/20 text-navy"
                  }`}
                >
                  {r === "ORG_ADMIN" ? t("roleAdmin") : t("roleMember")}
                </button>
              ))}
            </div>
          </label>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          {inviteSuccess && <p className="text-sm font-medium text-teal">{inviteSuccess}</p>}
          <Button type="submit" disabled={inviting} className="self-start">
            {inviting ? t("sending") : t("sendInvite")}
          </Button>
        </form>
      </section>

      {/* Roster. */}
      <section className="mt-8">
        <h2 className="font-display text-lg text-navy">{t("members")}</h2>
        {rosterLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : roster.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">{t("noMembersYet")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy/10">
            {roster.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-navy">
                    {m.email}
                    {m.userId === user.id && (
                      <span className="ml-2 rounded-sm bg-teal/10 px-1.5 py-0.5 text-xs font-medium text-teal">
                        {t("you")}
                      </span>
                    )}
                  </p>
                  <p className="text-navy/50">
                    {m.role === "ORG_ADMIN" ? t("roleAdmin") : t("roleMember")} · {t("joined")}{" "}
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                {m.userId !== user.id && (
                  <button
                    onClick={() => revokeMember(m.userId)}
                    disabled={revokingUserId === m.userId}
                    className="text-red-600 underline underline-offset-2 disabled:opacity-50"
                  >
                    {revokingUserId === m.userId ? t("revoking") : t("revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Single sign-on. */}
      <section className="mt-8 rounded border border-navy/10 p-5">
        <h2 className="font-display text-lg text-navy">{t("sso")}</h2>
        <p className="mt-1 text-sm text-navy/60">{t("ssoDescription")}</p>

        {ssoLoading ? (
          <p className="mt-4 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : (
          <form onSubmit={saveSso} className="mt-4 flex flex-col gap-4" noValidate>
            <Field
              label={t("issuerUrlLabel")}
              type="url"
              placeholder="https://your-idp.example.com"
              value={ssoIssuerUrl}
              onChange={(e) => setSsoIssuerUrl(e.target.value)}
              required
            />
            <Field
              label={t("clientIdLabel")}
              value={ssoClientId}
              onChange={(e) => setSsoClientId(e.target.value)}
              required
            />
            <Field
              label={t("clientSecretLabel")}
              type="password"
              placeholder={ssoConnection ? t("clientSecretPlaceholder") : undefined}
              value={ssoClientSecret}
              onChange={(e) => setSsoClientSecret(e.target.value)}
              required
            />
            <Field
              label={t("allowedDomainLabel")}
              placeholder="acme.com"
              value={ssoDomain}
              onChange={(e) => setSsoDomain(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={(e) => setSsoEnabled(e.target.checked)}
                className="h-4 w-4 rounded-sm border-navy/30"
              />
              {t("enabledLabel")}
            </label>

            {ssoError && <p className="text-sm text-red-600">{ssoError}</p>}
            {ssoSuccess && <p className="text-sm font-medium text-teal">{ssoSuccess}</p>}

            <Button type="submit" disabled={ssoSaving} className="self-start">
              {ssoSaving
                ? t("saving")
                : ssoConnection
                  ? t("updateConnection")
                  : t("saveConnection")}
            </Button>
          </form>
        )}
      </section>

      {/* Aggregate trends — anonymized, cohort-level only. */}
      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">
          {t("symptomTrendsHeader", { days: TRENDS_WINDOW_DAYS })}
        </h2>
        <p className="mt-1 text-sm text-navy/60">{t("trendsAnonymizedNote")}</p>
        {trendsLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : !frequency || frequency.suppressed ? (
          <p className="mt-4 text-sm text-navy/50">{t("trendsSuppressed")}</p>
        ) : frequency.categories.length === 0 ? (
          <p className="mt-4 text-sm text-navy/50">{t("trendsEmpty")}</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-navy/40">
              {t("basedOnCohort", { count: frequency.cohortSize })}
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {(() => {
                const maxCount = frequency.categories[0]?.count ?? 1;
                return frequency.categories.map(({ category, count }) => (
                  <li key={category} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 text-navy">{tEnum(`category.${category}`)}</span>
                    <div className="h-2.5 flex-1 rounded-full bg-navy/5">
                      <div
                        className="h-2.5 rounded-full bg-brass"
                        style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-navy/50">{count}</span>
                  </li>
                ));
              })()}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
