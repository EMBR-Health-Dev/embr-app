"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { changePasswordSchema } from "@embr/validation";
import type { DeviceSessionDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
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
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setPasswordError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setChangingPassword(false);
    }
  }

  async function revokeSession(id: string) {
    setConfirmingRevokeId(null);
    setRevokingId(id);
    try {
      await api.auth.sessions.revoke(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setRevokingId(null);
    }
  }

  async function logoutEverywhere() {
    setConfirmingLogoutAll(false);
    setLoggingOutAll(true);
    try {
      await api.auth.logoutAll();
      router.push("/login");
    } finally {
      setLoggingOutAll(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError(t("enterPasswordToConfirm"));
      return;
    }
    setDeleting(true);
    try {
      await api.auth.deleteAccount({ password: deletePassword });
      router.push("/login");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">{tCommon("loading")}</p>
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

      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">{t("changePasswordTitle")}</h2>
        <p className="mt-1 text-sm text-navy/60">{t("changePasswordDescription")}</p>
        <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-4" noValidate>
          <Field
            label={t("currentPasswordLabel")}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={fieldErrors.currentPassword}
          />
          <Field
            label={t("newPasswordLabel")}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={fieldErrors.newPassword}
          />
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <Button type="submit" disabled={changingPassword} className="self-start">
            {changingPassword ? t("changing") : t("changePassword")}
          </Button>
        </form>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-navy">{t("devices")}</h2>
          {!confirmingLogoutAll ? (
            <button
              onClick={() => setConfirmingLogoutAll(true)}
              className="text-sm font-medium text-red-600 underline underline-offset-2"
            >
              {t("logoutEverywhere")}
            </button>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-navy/60">{t("confirmLogoutAllMessage")}</span>
              <button
                onClick={logoutEverywhere}
                disabled={loggingOutAll}
                className="font-medium text-red-600 underline underline-offset-2 disabled:opacity-50"
              >
                {loggingOutAll ? t("loggingOut") : t("logoutEverywhere")}
              </button>
              <button
                onClick={() => setConfirmingLogoutAll(false)}
                disabled={loggingOutAll}
                className="text-navy/60 underline underline-offset-2 disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </div>
          )}
        </div>

        {sessionsLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">{t("noActiveSessions")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy/10">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-navy">
                    {s.userAgent ?? t("unknownDevice")}
                    {s.current && (
                      <span className="ml-2 rounded-sm bg-teal/10 px-1.5 py-0.5 text-xs font-medium text-teal">
                        {t("thisDevice")}
                      </span>
                    )}
                  </p>
                  <p className="text-navy/50">
                    {s.ipAddress ?? t("unknownIp")} · {t("signedIn")}{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!s.current &&
                  (confirmingRevokeId === s.id ? (
                    <span className="flex items-center gap-3">
                      <button
                        onClick={() => revokeSession(s.id)}
                        disabled={revokingId === s.id}
                        className="text-red-600 underline underline-offset-2 disabled:opacity-50"
                      >
                        {revokingId === s.id ? t("revoking") : t("revoke")}
                      </button>
                      <button
                        onClick={() => setConfirmingRevokeId(null)}
                        className="text-navy/60 underline underline-offset-2"
                      >
                        {t("cancel")}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingRevokeId(s.id)}
                      className="text-red-600 underline underline-offset-2"
                    >
                      {t("revoke")}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 border-t border-red-200 pt-8">
        <h2 className="font-display text-lg text-navy">{t("deleteAccountTitle")}</h2>
        <p className="mt-2 text-sm text-navy/60">{t("deleteAccountDescription")}</p>

        {!deleteConfirming ? (
          <button
            onClick={() => setDeleteConfirming(true)}
            className="mt-4 text-sm font-medium text-red-600 underline underline-offset-2"
          >
            {t("deleteMyAccount")}
          </button>
        ) : (
          <div className="mt-4 flex max-w-sm flex-col gap-3">
            <Field
              label={t("confirmPasswordLabel")}
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <p className="text-xs text-navy/50">
              {t("forgotPasswordHint")}{" "}
              <Link href="/forgot-password" className="text-teal underline underline-offset-2">
                {t("forgotPasswordLink")}
              </Link>
            </p>
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? t("deleting") : t("permanentlyDelete")}
              </button>
              <button
                onClick={() => {
                  setDeleteConfirming(false);
                  setDeletePassword("");
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="text-sm text-navy/60 underline underline-offset-2 disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
