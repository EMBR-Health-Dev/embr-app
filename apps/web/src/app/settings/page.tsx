"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { changePasswordSchema } from "@embr/validation";
import type { DeviceSessionDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

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
    if (!user) return;
    api.auth.sessions
      .list()
      .then(setSessions)
      .finally(() => setSessionsLoading(false));
  }, [user]);

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
      // Changing your password revokes every session, including this
      // one (see apps/api's auth.service.ts) — that's deliberate, not
      // a bug, so the redirect here is expected, not an error state.
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
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">Settings</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">Change password</h2>
        <p className="mt-1 text-sm text-navy/60">
          Changing your password signs you out everywhere, including this device — you&apos;ll need
          to log back in.
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
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <Button type="submit" disabled={changingPassword} className="self-start">
            {changingPassword ? "Changing…" : "Change password"}
          </Button>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-navy">Devices</h2>
          <button
            onClick={logoutEverywhere}
            disabled={loggingOutAll}
            className="text-sm font-medium text-red-600 underline underline-offset-2 disabled:opacity-50"
          >
            {loggingOutAll ? "Logging out…" : "Log out everywhere"}
          </button>
        </div>

        {sessionsLoading ? (
          <p className="mt-3 text-sm text-navy/50">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">No active sessions.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy/10">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-navy">
                    {s.userAgent ?? "Unknown device"}
                    {s.current && (
                      <span className="ml-2 rounded-sm bg-teal/10 px-1.5 py-0.5 text-xs font-medium text-teal">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-navy/50">
                    {s.ipAddress ?? "Unknown IP"} · signed in{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={revokingId === s.id}
                    className="text-red-600 underline underline-offset-2 disabled:opacity-50"
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
