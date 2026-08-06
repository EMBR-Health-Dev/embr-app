"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
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
      await api.auth.login(parsed.data);
      await refresh();
      // Only ever follow a same-origin, path-relative next — anything
      // else (a full URL, protocol-relative "//evil.com") is dropped in
      // favor of the default, since this value round-trips through a
      // query param an attacker could craft.
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      // Deliberately the same message shape the API itself returns for
      // both "wrong password" and "no such account" — no reason for the
      // client to behave differently and risk implying otherwise.
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-navy">Welcome back</h1>

        <div className="mt-6">
          <ReasonBanner />
        </div>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4" noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-navy/60">
          New to EMBR?{" "}
          <Link href="/register" className="font-medium text-teal underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
