"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginLinkRequestSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { consentHref, needsConsentReview } from "../../lib/consent";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

/** Asks for an email and sends a one time sign in link to it. */
function RequestLink() {
  const t = useTranslations("LoginLink");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldError(undefined);

    const parsed = loginLinkRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      // Same answer whether or not the account exists, as the API.
      await api.auth.requestLoginLink(parsed.data.email);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-display-m text-foreground">{t("checkEmailTitle")}</h1>
        <p className="mt-4 text-foreground/70">{t("checkEmailBody")}</p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-2"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
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
          error={fieldError}
        />

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
        <Link href="/login" className="font-medium text-primary underline underline-offset-2">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}

/**
 * Where the emailed link lands. Signing in takes one click rather than
 * happening on load: mail scanners open links on arrival, and would
 * otherwise use up the one time link before the person does.
 */
function UseLink({ token }: { token: string }) {
  const t = useTranslations("LoginLink");
  const router = useRouter();
  const { refresh } = useAuth();
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    setFailed(false);
    setSubmitting(true);
    try {
      const session = await api.auth.consumeLoginLink(token);
      await refresh();
      const destination = session.user.onboardingCompletedAt ? "/dashboard" : "/onboarding";
      router.push(needsConsentReview(session.user) ? consentHref(destination) : destination);
    } catch {
      setFailed(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-display-m text-foreground">{t("useTitle")}</h1>
      <p className="mt-3 text-sm text-foreground/60">{t("useSubtitle")}</p>

      {failed && (
        <div role="alert" className="mt-6 text-sm text-foreground">
          <p className="font-medium">{t("expired")}</p>
          <Link
            href="/login-link"
            className="mt-1 inline-block font-medium text-primary underline underline-offset-2"
          >
            {t("sendNew")}
          </Link>
        </div>
      )}

      <Button onClick={signIn} disabled={submitting} className="mt-8 w-full">
        {submitting ? t("signingIn") : t("signIn")}
      </Button>
    </div>
  );
}

function LoginLink() {
  const token = useSearchParams().get("token");
  return token ? <UseLink token={token} /> : <RequestLink />;
}

export default function LoginLinkPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense fallback={null}>
        <LoginLink />
      </Suspense>
    </main>
  );
}
