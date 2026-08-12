"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuditLogDto, UserDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";

type Tab = "users" | "audit";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isAdmin, loading, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  const [users, setUsers] = useState<UserDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
    // No `else if (!isAdmin)` branch needed here — the !isAdmin render
    // path below never reads dataLoading, so there's nothing to set.
  }, [loading, user, router]);

  useEffect(() => {
    if (!isAdmin) return;
    // Matches React's own documented data-fetching-in-effect pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data), which
    // also resets the loading flag synchronously before the fetch
    // starts — this is what makes switching tabs show a loading state
    // again rather than briefly flashing stale data from the previous
    // tab. react-hooks/set-state-in-effect flags it anyway; suppressed
    // rather than contorted into something artificial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    const load =
      tab === "users"
        ? api.admin.listUsers({ pageSize: 50 }).then((page) => setUsers(page.items))
        : api.admin.listAuditLogs({ pageSize: 50 }).then((page) => setAuditLogs(page.items));
    load.finally(() => setDataLoading(false));
  }, [tab, isAdmin]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-bone/50">Loading…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-2xl text-bone">Not authorized</h1>
        <p className="max-w-sm text-bone/60">
          {user.email} is signed in but doesn&apos;t have admin access on this platform.
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-bone">EMBR Admin</h1>
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

      <nav className="mt-8 flex gap-1 border-b border-bone/10">
        {(["users", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-brass text-bone" : "text-bone/50 hover:text-bone/80"
            }`}
          >
            {t === "users" ? "Users" : "Audit log"}
          </button>
        ))}
      </nav>

      {dataLoading ? (
        <p className="mt-6 text-sm text-bone/50">Loading…</p>
      ) : tab === "users" ? (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="text-bone/50">
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Verified</th>
              <th className="pb-2 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bone/10">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5 text-bone">{u.email}</td>
                <td className="py-2.5 text-bone/70">{u.role}</td>
                <td className="py-2.5 text-bone/70">{u.emailVerified ? "Yes" : "No"}</td>
                <td className="py-2.5 text-bone/50">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="text-bone/50">
              <th className="pb-2 font-medium">Action</th>
              <th className="pb-2 font-medium">User</th>
              <th className="pb-2 font-medium">IP</th>
              <th className="pb-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bone/10">
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="py-2.5 text-bone">{log.action}</td>
                <td className="py-2.5 text-bone/70">{log.userId ?? "—"}</td>
                <td className="py-2.5 text-bone/50">{log.ipAddress ?? "—"}</td>
                <td className="py-2.5 text-bone/50">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
