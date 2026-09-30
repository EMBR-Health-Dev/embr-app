"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ConsentType } from "@embr/types";
import { CONSENT_TYPES, LEGAL_DOCUMENT_VERSIONS, registerSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { ConsentItems } from "../../components/consent-items";

const REQUIRED_MESSAGE = {
  TERMS: "termsRequired",
  PRIVACY: "privacyRequired",
  HEALTH_PROCESSING: "healthRequired",
} as const;

function RegisterForm() {
  const t = useTranslations("Register");
  const tConsent = useTranslations("Consent");
  const locale = useLocale() === "ja" ? "ja" : "en";
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Every box starts unticked; nothing is ever pre-checked.
  const [consentChecked, setConsentChecked] = useState<Partial<Record<ConsentType, boolean>>>({});
  const [consentErrors, setConsentErrors] = useState<Partial<Record<ConsentType, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setConsentErrors({});

    const parsed = registerSchema.safeParse({
      email,
      password,
      // One entry per ticked box, each with the version this page shows.
      consents: CONSENT_TYPES.filter((type) => consentChecked[type]).map((type) => ({
        type,
        version: LEGAL_DOCUMENT_VERSIONS[type],
      })),
      locale,
      client: "web",
    });
    const missingConsents: Partial<Record<ConsentType, string>> = {};
    if (!consentChecked.TERMS) missingConsents.TERMS = tConsent("termsRequired");
    if (!consentChecked.PRIVACY) missingConsents.PRIVACY = tConsent("privacyRequired");
    if (!parsed.success || Object.keys(missingConsents).length > 0) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        errors[issue.path.join(".")] = issue.message;
      }
      setFieldErrors(errors);
      setConsentErrors(missingConsents);
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.register(parsed.data);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONSENT_VERSION_OUTDATED") {
        setFormError(tConsent("versionOutdated"));
      } else if (
        err instanceof ApiError &&
        err.details?.some((d) => d.field.startsWith("consents."))
      ) {
        // The server decides which items registration requires (health
        // processing is configurable); show its answer against the box.
        const errors: Partial<Record<ConsentType, string>> = {};
        for (const d of err.details) {
          const type = d.field.replace("consents.", "") as ConsentType;
          if (CONSENT_TYPES.includes(type)) errors[type] = tConsent(REQUIRED_MESSAGE[type]);
        }
        setConsentErrors(errors);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-display-m text-foreground">{t("checkEmailTitle")}</h1>
        <p className="max-w-sm text-foreground/70">
          {t.rich("checkEmailBody", {
            email,
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <Link
          href={loginHref}
          className="text-sm font-medium text-foreground underline underline-offset-2"
        >
          {t("goToLogin")}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display-m text-foreground">{t("title")}</h1>
        <p className="mt-3 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5" noValidate>
          <Field
            label={t("emailLabel")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />
          <Field
            label={t("passwordLabel")}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <p className="text-xs text-foreground/50">{t("passwordHint")}</p>

          <ConsentItems
            items={["TERMS", "PRIVACY", "HEALTH_PROCESSING"]}
            checked={consentChecked}
            onToggle={(type, value) => setConsentChecked((prev) => ({ ...prev, [type]: value }))}
            errors={consentErrors}
          />
          <p className="text-xs text-foreground/50">{tConsent("manageNote")}</p>

          {formError && (
            <p role="alert" className="text-sm font-medium text-foreground">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="mt-4">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          {t("alreadyHaveAccount")}{" "}
          <Link href={loginHref} className="font-medium text-primary underline underline-offset-2">
            {t("logIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
