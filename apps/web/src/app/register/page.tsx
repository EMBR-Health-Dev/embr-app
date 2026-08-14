"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { registerSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

function RegisterForm() {
  const t = useTranslations("Register");
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = registerSchema.safeParse({ email, password });
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
      await api.auth.register(parsed.data);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
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
        <h1 className="font-display text-3xl text-navy">{t("checkEmailTitle")}</h1>
        <p className="max-w-sm text-navy/70">
          {t.rich("checkEmailBody", {
            email,
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <Link
          href={loginHref}
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("goToLogin")}
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
          <Field
            label={t("passwordLabel")}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <p className="text-xs text-navy/50">{t("passwordHint")}</p>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-navy/60">
          {t("alreadyHaveAccount")}{" "}
          <Link href={loginHref} className="font-medium text-teal underline underline-offset-2">
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
