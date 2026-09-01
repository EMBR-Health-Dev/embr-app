"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { forgotPasswordSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

type Status = "verifying" | "success" | "error";

function ResendVerificationForm() {
  const t = useTranslations("VerifyEmail");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleResend() {
    setFormError(null);
    setFieldError(undefined);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.resendVerification(parsed.data.email);
      // Same non-enumeration promise as forgot-password: the API
      // always returns success here regardless of whether an account
      // exists or is already verified (see auth.service.ts's
      // resendVerification), so the client shows the same done state
      // for every non-error outcome.
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="mt-6 text-sm text-teal">{t("resendCheckEmail")}</p>;
  }

  return (
    <div className="mt-6 w-full max-w-sm">
      <p className="text-sm text-navy/60">{t("resendPrompt")}</p>
      <div className="mt-3 flex flex-col gap-3">
        <Field
          label={t("emailLabel")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <Button onClick={handleResend} disabled={submitting} className="self-start">
          {submitting ? t("resendSubmitting") : t("resendButton")}
        </Button>
      </div>
    </div>
  );
}

function VerifyEmailContent() {
  const t = useTranslations("VerifyEmail");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.auth
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "verifying") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-navy/50">{t("verifying")}</p>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-3xl text-navy">{t("successTitle")}</h1>
        <p className="max-w-sm text-navy/70">{t("successBody")}</p>
        <Link href="/login" className="text-sm font-medium text-teal underline underline-offset-2">
          {t("goToLogin")}
        </Link>
      </main>
    );
  }

  // No token in the URL and an API-rejected (invalid/expired/already
  // consumed) token share the same dead-end display — the server
  // doesn't distinguish those cases in its own error message either
  // (see auth.service.ts's verifyEmail), so there's nothing more
  // specific to tell the person either way.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl text-navy">{t("invalidLinkTitle")}</h1>
      <p className="max-w-sm text-navy/70">{errorMessage ?? t("invalidLinkBody")}</p>
      <ResendVerificationForm />
      <Link href="/login" className="text-sm font-medium text-teal underline underline-offset-2">
        {t("backToLogin")}
      </Link>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
