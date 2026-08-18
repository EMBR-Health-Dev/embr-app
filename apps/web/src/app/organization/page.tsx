"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  MyOrganizationMembershipDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
  SsoConnectionDto,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

const TRENDS_WINDOW_DAYS = 90;

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
  }, [selectedOrgId]);

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

  if (loading || !user || memberships === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const adminOrgs = memberships.filter((m) => m.role === "ORG_ADMIN");

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
        <p className="mt-8 text-sm text-navy/60">
          {memberships.length === 0 ? t("notAMember") : t("notAnAdmin")}
        </p>
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
