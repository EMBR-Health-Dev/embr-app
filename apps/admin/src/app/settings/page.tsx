"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { changePasswordSchema } from "@embr/validation";
import type { DeviceSessionDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

function ReasonBanner() {
  const reason = useSearchParams().get("reason");
  if (reason !== "password-changed") return null;
  return (
    <p className="mb-6 rounded-sm bg-teal/10 px-3 py-2 text-sm text-teal">
      Password changed. Log in with your new password.
    </p>
  );
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [sessions, setSessions] = useState<DeviceSessionDto[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!isAdmin) return;
    api.auth.sessions
      .list()
      .then(setSessions)
      .finally(() => setSessionsLoading(false));
  }, [isAdmin]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setFieldErrors({});

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
      setFieldErrors(errors);
      return;
    }

    setChangingPassword(true);
    try {
      await api.auth.changePassword(parsed.data);
      // Same as apps/web: this revokes every session including the
      // current one, by design (see apps/api's auth.service.ts).
      router.push("/login?reason=password-changed");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  async function revokeSession(id: string) {
    setRevokingId(id);
    try {
      await api.auth.sessions.revoke(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setRevokingId(null);
    }
  }

  async function logoutEverywhere() {
    setLoggingOutAll(true);
    try {
      await api.auth.logoutAll();
      router.push("/login");
    } finally {
      setLoggingOutAll(false);
    }
  }

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
        <p className="max-w-sm text-bone/60">{user.email} doesn&apos;t have admin access.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-bone">Settings</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      <Suspense fallback={null}>
        <div className="mt-6">
          <ReasonBanner />
        </div>
      </Suspense>

      <section className="mt-4">
        <h2 className="font-display text-lg text-bone">Change password</h2>
        <p className="mt-1 text-sm text-bone/60">
          Changing your password signs you out everywhere, including this device.
        </p>
        <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-4" noValidate>
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={fieldErrors.currentPassword}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={fieldErrors.newPassword}
          />
          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          <Button type="submit" disabled={changingPassword} className="self-start">
            {changingPassword ? "Changing…" : "Change password"}
          </Button>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-bone">Devices</h2>
          <button
            onClick={logoutEverywhere}
            disabled={loggingOutAll}
            className="text-sm font-medium text-red-400 underline underline-offset-2 disabled:opacity-50"
          >
            {loggingOutAll ? "Logging out…" : "Log out everywhere"}
          </button>
        </div>

        {sessionsLoading ? (
          <p className="mt-3 text-sm text-bone/50">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-bone/50">No active sessions.</p>
        ) : (
          <ul className="mt-4 divide-y divide-bone/10">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-bone">
                    {s.userAgent ?? "Unknown device"}
                    {s.current && (
                      <span className="ml-2 rounded-sm bg-teal/10 px-1.5 py-0.5 text-xs font-medium text-teal">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-bone/50">
                    {s.ipAddress ?? "Unknown IP"} · signed in{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={revokingId === s.id}
                    className="text-red-400 underline underline-offset-2 disabled:opacity-50"
                  >
                    {revokingId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
