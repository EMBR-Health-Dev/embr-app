"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { passwordSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

function ResetPasswordForm() {
  const t = useTranslations("ResetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setFieldErrors({ password: parsed.error.issues[0]?.message ?? t("genericError") });
      return;
    }
    // Confirmation matching is a client-side-only concept — there's
    // nothing for the server to check here beyond the password itself
    // (see resetPasswordSchema), same as every other password field in
    // this app never asking the server to confirm a match.
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: t("passwordsDontMatch") });
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.resetPassword({ token: token!, password: parsed.data });
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
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

  // A missing token means this wasn't opened from a real reset link —
  // nothing to submit, so show the dead-end state instead of a form
  // that can only ever fail.
  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-3xl text-navy">{t("invalidLinkTitle")}</h1>
        <p className="max-w-sm text-navy/70">{t("invalidLinkBody")}</p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("requestNewLink")}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-navy">{t("title")}</h1>
        <p className="mt-2 text-sm text-navy/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
          <Field
            label={t("newPasswordLabel")}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <p className="text-xs text-navy/50">{t("passwordHint")}</p>
          <Field
            label={t("confirmPasswordLabel")}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
