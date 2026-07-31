"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  MyOrganizationMembershipDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

const TRENDS_WINDOW_DAYS = 90;

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function OrganizationPage() {
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
      setInviteSuccess(`Invitation sent to ${invite.email}.`);
      setInviteEmail("");
      setInviteRole("ORG_MEMBER");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Couldn't send that invite — try again.");
    } finally {
      setInviting(false);
    }
  }

  if (loading || !user || memberships === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  const adminOrgs = memberships.filter((m) => m.role === "ORG_ADMIN");

  if (adminOrgs.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-navy">Organization</h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-teal underline underline-offset-2"
          >
            ← Dashboard
          </Link>
        </header>
        <p className="mt-8 text-sm text-navy/60">
          {memberships.length === 0
            ? "You're not part of an organization on EMBR — this page is for the person who administers an employer, insurer, or clinic account."
            : "You belong to an organization, but only its ORG_ADMIN can manage the roster and see aggregate trends. If that should be you, ask your organization's admin to change your role."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">Organization</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      {adminOrgs.length > 1 && (
        <label className="mt-6 flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">Managing</span>
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
            {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
            {org.seatLimit !== null && <> of {org.seatLimit} seats</>} · <code>{org.slug}</code>
          </p>
        )}
      </section>

      {/* Invite. */}
      <section className="mt-8 rounded border border-navy/10 p-5">
        <h2 className="font-display text-lg text-navy">Invite someone</h2>
        <form onSubmit={sendInvite} className="mt-4 flex flex-col gap-4" noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="off"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">Role</span>
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
                  {r === "ORG_ADMIN" ? "Admin" : "Member"}
                </button>
              ))}
            </div>
          </label>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          {inviteSuccess && <p className="text-sm font-medium text-teal">{inviteSuccess}</p>}
          <Button type="submit" disabled={inviting} className="self-start">
            {inviting ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </section>

      {/* Roster. */}
      <section className="mt-8">
        <h2 className="font-display text-lg text-navy">Members</h2>
        {rosterLoading ? (
          <p className="mt-3 text-sm text-navy/50">Loading…</p>
        ) : roster.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">No members yet — send an invite above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy/10">
            {roster.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-navy">
                    {m.email}
                    {m.userId === user.id && (
                      <span className="ml-2 rounded-sm bg-teal/10 px-1.5 py-0.5 text-xs font-medium text-teal">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-navy/50 capitalize">
                    {m.role === "ORG_ADMIN" ? "Admin" : "Member"} · joined{" "}
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                {m.userId !== user.id && (
                  <button
                    onClick={() => revokeMember(m.userId)}
                    disabled={revokingUserId === m.userId}
                    className="text-red-600 underline underline-offset-2 disabled:opacity-50"
                  >
                    {revokingUserId === m.userId ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Aggregate trends — anonymized, cohort-level only. */}
      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">
          Symptom trends, last {TRENDS_WINDOW_DAYS} days
        </h2>
        <p className="mt-1 text-sm text-navy/60">
          Anonymized across your organization — never any one member&apos;s individual record.
        </p>
        {trendsLoading ? (
          <p className="mt-3 text-sm text-navy/50">Loading…</p>
        ) : !frequency || frequency.suppressed ? (
          <p className="mt-4 text-sm text-navy/50">
            Not enough people have logged symptoms in this window yet to show a trend without
            risking identifying any one person. This isn&apos;t about your organization being
            too small overall — it&apos;s about how many members have actually logged something
            recently.
          </p>
        ) : frequency.categories.length === 0 ? (
          <p className="mt-4 text-sm text-navy/50">
            Nothing logged across the organization in this window yet.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-navy/40">
              Based on {frequency.cohortSize} member{frequency.cohortSize === 1 ? "" : "s"} who
              logged something in this window.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {(() => {
                const maxCount = frequency.categories[0]?.count ?? 1;
                return frequency.categories.map(({ category, count }) => (
                  <li key={category} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 text-navy">{categoryLabel(category)}</span>
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
