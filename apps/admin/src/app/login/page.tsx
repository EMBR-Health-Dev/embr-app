"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@embr/validation";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh, logout } = useAuth();
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
      for (const issue of parsed.error.issues) errors[issue.path.join(".")] = issue.message;
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const session = await api.auth.login(parsed.data);
      if (session.user.role !== "ADMIN") {
        // The account and password are genuinely correct — this is not
        // an auth failure, it's an authorization one, so it gets its
        // own message rather than being folded into "invalid
        // credentials." Immediately logged back out: an admin console
        // should never leave a non-admin session sitting authenticated.
        await logout();
        setFormError("This account doesn't have admin access.");
        return;
      }
      await refresh();
      router.push("/dashboard");
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
        <h1 className="font-display text-3xl text-bone">EMBR Admin</h1>
        <p className="mt-2 text-sm text-bone/60">
          Operations console — account and audit visibility only.
        </p>

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

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
