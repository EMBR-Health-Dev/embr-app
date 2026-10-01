"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ConsentType } from "@embr/types";
import { LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { pendingConsentTypes } from "../../lib/consent";
import { safeRedirect } from "../../lib/safe-redirect";
import { Button } from "../../components/button";
import { ConsentItems } from "../../components/consent-items";

/**
 * Shown whenever any consent item isn't current: accounts created
 * before consent recording existed, SSO accounts (which never see the
 * registration form), people who withdrew health processing, and
 * everyone after a document's version is raised. The API blocks health
 * features until this is done; this screen is how a person gets there,
 * without losing where they were going.
 */
function ConsentForm() {
  const t = useTranslations("Consent");
  const locale = useLocale() === "ja" ? "ja" : "en";
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect")) ?? "/dashboard";
  const { user, loading, refresh, logout } = useAuth();

  const [checked, setChecked] = useState<Partial<Record<ConsentType, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<ConsentType, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pending = user ? pendingConsentTypes(user) : [];

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/consent?redirect=${redirectTo}`)}`);
    } else if (pendingConsentTypes(user).length === 0) {
      router.replace(redirectTo);
    }
  }, [loading, user, router, redirectTo]);

  if (loading || !user || pending.length === 0) return null;

  const notes: Partial<Record<ConsentType, string>> = {};
  for (const type of pending) {
    if (user.consents[type] === "OUTDATED") notes[type] = t("updatedNote");
    if (user.consents[type] === "WITHDRAWN") notes[type] = t("withdrawnNote");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const unticked = pending.filter((type) => !checked[type]);
    if (unticked.length > 0) {
      setErrors(Object.fromEntries(unticked.map((type) => [type, t("allRequired")])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.consents.grant({
        consents: pending.map((type) => ({ type, version: LEGAL_DOCUMENT_VERSIONS[type] })),
        locale,
        client: "web",
      });
      await refresh();
      router.replace(redirectTo);
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.code === "CONSENT_VERSION_OUTDATED"
          ? t("versionOutdated")
          : t("genericError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="font-display text-display-m text-foreground">{t("title")}</h1>
        <p className="mt-3 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6" noValidate>
          <ConsentItems
            items={pending}
            checked={checked}
            onToggle={(type, value) => setChecked((prev) => ({ ...prev, [type]: value }))}
            errors={errors}
            notes={notes}
          />
          <p className="text-xs text-foreground/50">{t("manageNote")}</p>

          {formError && (
            <p role="alert" className="text-sm font-medium text-foreground">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? t("saving") : t("continue")}
          </Button>
        </form>

        <nav aria-label={t("otherOptions")} className="mt-10 border-t border-border-subtle pt-6">
          <h2 className="font-body text-xs font-medium uppercase tracking-wide text-foreground/50">
            {t("otherOptions")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/export" className="text-foreground underline underline-offset-2">
                {t("exportData")}
              </Link>
            </li>
            <li>
              <Link href="/settings" className="text-foreground underline underline-offset-2">
                {t("accountSettings")}
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={handleLogout}
                className="text-foreground underline underline-offset-2"
              >
                {t("logOut")}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentForm />
    </Suspense>
  );
}
