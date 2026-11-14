"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { BrandWordmark } from "../../components/brand-wordmark";
import type { AuthSessionResponse } from "@embr/types";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Two-step sign in: set once the password is right, until the code is.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function finishSignIn(session: AuthSessionResponse) {
    if (session.user.role !== "ADMIN") {
      // The account and password are genuinely correct — this is not
      // an auth failure, it's an authorization one, so it gets its
      // own message rather than being folded into "invalid
      // credentials." Immediately logged back out: an admin console
      // should never leave a non-admin session sitting authenticated.
      await logout();
      setMfaToken(null);
      setFormError("This account doesn't have admin access.");
      return;
    }
    await refresh();
    router.push("/dashboard");
  }

  async function handleCode(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setFormError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setFormError(
        useRecovery ? "Enter one of your recovery codes." : "Enter the 6 digit code from your app.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await finishSignIn(await api.auth.completeMfa({ mfaToken, code: trimmed }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The challenge ended (5 minutes or 5 codes): back to the password.
        setMfaToken(null);
        setPassword("");
        setCode("");
      }
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.auth.login(parsed.data);
      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setCode("");
        setUseRecovery(false);
        return;
      }
      await finishSignIn(result as AuthSessionResponse);
    } catch (err) {
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
        <h1 className="flex items-baseline gap-3 text-foreground">
          <BrandWordmark className="h-6" />
          <span className="text-sm font-medium uppercase tracking-[0.14em] text-foreground/70">
            Admin
          </span>
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          Operations console — account and audit visibility only.
        </p>

        {mfaToken ? (
          <form onSubmit={handleCode} className="mt-8 flex flex-col gap-4" noValidate>
            <p className="text-sm text-foreground">
              {useRecovery
                ? "Enter one of the recovery codes you saved when you turned on two-step sign in."
                : "Open your authenticator app and enter the 6 digit code for EMBR."}
            </p>
            <Field
              key={useRecovery ? "recovery" : "totp"}
              label={useRecovery ? "Recovery code" : "6 digit code"}
              autoComplete="one-time-code"
              inputMode={useRecovery ? "text" : "numeric"}
              spellCheck={false}
              autoFocus
              maxLength={useRecovery ? 20 : 7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Checking…" : "Continue"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setFormError(null);
              }}
              className="self-start text-sm font-medium text-foreground underline underline-offset-2"
            >
              {useRecovery ? "Use the code from my app instead" : "Use a recovery code instead"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
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

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
