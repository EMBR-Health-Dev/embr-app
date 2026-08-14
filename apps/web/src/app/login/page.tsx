"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { safeRedirect } from "../../lib/safe-redirect";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_not_configured: "No SSO connection is set up for that email's domain.",
  sso_start_failed: "Couldn't start SSO sign-in. Try again in a moment.",
  sso_callback_failed:
    "SSO sign-in didn't complete — try again, or log in with your password below.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();

  const reason = searchParams.get("reason");
  const ssoError = searchParams.get("ssoError");
  const redirectParam = searchParams.get("redirect");
  const redirectTo = safeRedirect(redirectParam) ?? "/dashboard";
  const registerHref = redirectParam
    ? `/register?redirect=${encodeURIComponent(redirectParam)}`
    : "/register";

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
      const session = await api.auth.login(parsed.data);
      await refresh();
      // An explicit redirect param (SSO, accept-invite) always wins —
      // those flows have their own reason for sending the person
      // somewhere specific, and onboarding shouldn't interrupt them.
      if (redirectParam) {
        router.push(redirectTo);
      } else if (!session.user.onboardingCompletedAt) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
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

  function handleSsoClick() {
    setFormError(null);
    // Reuses whatever's already in the email field above rather than a
    // second input — "log in with this email" is the same idea whether
    // the next step is a password or an IdP redirect.
    const parsedEmail = loginSchema.shape.email.safeParse(email);
    if (!parsedEmail.success) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Enter your email above, then continue with SSO.",
      }));
      return;
    }
    // Full-page navigation, not a fetch — the browser needs to actually
    // leave this page and follow the API's redirect to the IdP.
    window.location.href = api.sso.startUrl(parsedEmail.data);
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-3xl text-navy">Welcome back</h1>

      {reason === "password-changed" && (
        <p className="mb-6 mt-6 rounded-sm bg-teal/10 px-3 py-2 text-sm text-teal">
          Password changed. Log in with your new password.
        </p>
      )}

      {ssoError && (
        <p className="mb-6 mt-6 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-600">
          {SSO_ERROR_MESSAGES[ssoError] ?? "SSO sign-in didn't work. Try again."}
        </p>
      )}

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

      <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wide text-navy/40">
        <span className="h-px flex-1 bg-navy/10" />
        or
        <span className="h-px flex-1 bg-navy/10" />
      </div>

      <Button variant="ghost" className="mt-6 w-full" onClick={handleSsoClick}>
        Continue with SSO
      </Button>

      <p className="mt-6 text-center text-sm text-navy/60">
        New to EMBR?{" "}
        <Link href={registerHref} className="font-medium text-teal underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
