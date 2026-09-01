"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { forgotPasswordSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function ForgotPasswordPage() {
  const t = useTranslations("ForgotPassword");

  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.join(".")] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.forgotPassword(parsed.data.email);
      // The API itself always returns success here regardless of
      // whether an account exists for this email (see
      // auth.service.ts's forgotPassword) — showing the same done
      // state for every non-error outcome is what keeps that promise
      // on the client side too, rather than only being true at the
      // network layer.
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
        <h1 className="font-display text-3xl text-navy">{t("checkEmailTitle")}</h1>
        <p className="max-w-sm text-navy/70">{t("checkEmailBody")}</p>
        <Link href="/login" className="text-sm font-medium text-teal underline underline-offset-2">
          {t("backToLogin")}
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
            label={t("emailLabel")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-navy/60">
          <Link href="/login" className="font-medium text-teal underline underline-offset-2">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
