"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  MyOrganizationMembershipDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
} from "@embr/types";
import { inviteMemberSchema } from "@embr/validation";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function InviteForm({
  organizationId,
  onInvited,
}: {
  organizationId: string;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldError(undefined);
    setSent(null);

    const parsed = inviteMemberSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      const invite = await api.organizations.inviteMember(organizationId, parsed.data);
      setSent(invite.email);
      setEmail("");
      onInvited();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-3" noValidate>
      <div className="flex-1">
        <Field
          label="Invite by email"
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
        />
      </div>
      <Button type="submit" disabled={submitting} className="mt-6">
        {submitting ? "Sending…" : "Send invite"}
      </Button>
      {formError && <p className="mt-8 text-sm text-red-400">{formError}</p>}
      {sent && <p className="mt-8 text-sm text-teal">Invite sent to {sent}.</p>}
    </form>
  );
}

function OrgConsole({ membership }: { membership: MyOrganizationMembershipDto }) {
  const { organizationId } = membership;
  const [members, setMembers] = useState<OrganizationMemberDto[]>([]);
  const [trends, setTrends] = useState<OrgSymptomFrequencyDto | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function loadMembers() {
    const page = await api.organizations.members(organizationId, { pageSize: 100 });
    setMembers(page.items);
  }

  async function loadAll() {
    setLoadingData(true);
    try {
      const [, freq] = await Promise.all([
        loadMembers(),
        api.organizations.symptomFrequency(organizationId),
      ]);
      setTrends(freq);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [organizationId]);

  async function handleRevoke(userId: string) {
    setRevoking(userId);
    try {
      await api.organizations.revokeMember(organizationId, userId);
      await loadMembers();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="font-display text-xl text-bone">{membership.organizationName}</h2>
      <p className="text-sm text-bone/50">{membership.organizationSlug}</p>

      <div className="mt-6 rounded-sm border border-bone/10 p-4">
        <InviteForm organizationId={organizationId} onInvited={loadMembers} />
      </div>

      {loadingData ? (
        <p className="mt-6 text-sm text-bone/50">Loading…</p>
      ) : (
        <>
          <section className="mt-8">
            <h3 className="text-sm font-medium text-bone/70">
              Members <span className="text-bone/40">({members.length})</span>
            </h3>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-bone/50">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Joined</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bone/10">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 text-bone">{m.email}</td>
                    <td className="py-2.5 text-bone/70">{m.role}</td>
                    <td className="py-2.5 text-bone/50">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => void handleRevoke(m.userId)}
                        disabled={revoking === m.userId}
                        className="text-xs text-red-400 underline underline-offset-2 hover:text-red-300 disabled:opacity-50"
                      >
                        {revoking === m.userId ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-8">
            <h3 className="text-sm font-medium text-bone/70">Symptom trends</h3>
            {trends?.suppressed ? (
              <p className="mt-3 max-w-md text-sm text-bone/50">
                Not enough active members ({trends.cohortSize} logging in range) to show anonymized
                trends without risking identifying anyone. This appears once enough members have
                logged data.
              </p>
            ) : trends && trends.categories.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {trends.categories.map((c) => (
                  <li key={c.category} className="flex items-center justify-between">
                    <span className="text-bone/70">{categoryLabel(c.category)}</span>
                    <span className="text-bone">{c.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-bone/50">No symptom data logged yet.</p>
            )}
            <p className="mt-3 text-xs text-bone/40">
              Anonymized and cohort-level only — never an individual member&apos;s records.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [memberships, setMemberships] = useState<MyOrganizationMembershipDto[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    api.organizations.my().then((data) => {
      setMemberships(data);
      const firstAdmin = data.find((m) => m.role === "ORG_ADMIN");
      if (firstAdmin) setSelectedOrgId(firstAdmin.organizationId);
    });
  }, [loading, user, router]);

  if (loading || !user || memberships === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-bone/50">Loading…</p>
      </main>
    );
  }

  const orgAdminMemberships = memberships.filter((m) => m.role === "ORG_ADMIN");

  if (orgAdminMemberships.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-2xl text-bone">No organization access</h1>
        <p className="max-w-sm text-bone/60">
          {user.email} isn&apos;t an admin of any organization on EMBR.
        </p>
        <button
          onClick={() => logout().then(() => router.replace("/login"))}
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          Log out
        </button>
      </main>
    );
  }

  const selected = orgAdminMemberships.find((m) => m.organizationId === selectedOrgId);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-bone">Organization admin</h1>
        <div className="flex items-center gap-4 text-sm text-bone/60">
          <Link href="/settings" className="underline underline-offset-2 hover:text-bone">
            Settings
          </Link>
          <span>{user.email}</span>
          <button
            onClick={() => logout().then(() => router.replace("/login"))}
            className="underline underline-offset-2 hover:text-bone"
          >
            Log out
          </button>
        </div>
      </header>

      {orgAdminMemberships.length > 1 && (
        <nav className="mt-8 flex gap-1 border-b border-bone/10">
          {orgAdminMemberships.map((m) => (
            <button
              key={m.organizationId}
              onClick={() => setSelectedOrgId(m.organizationId)}
              className={`px-4 py-2 text-sm font-medium ${
                selectedOrgId === m.organizationId
                  ? "border-b-2 border-brass text-bone"
                  : "text-bone/50 hover:text-bone/80"
              }`}
            >
              {m.organizationName}
            </button>
          ))}
        </nav>
      )}

      {selected && <OrgConsole key={selected.organizationId} membership={selected} />}
    </main>
  );
}
