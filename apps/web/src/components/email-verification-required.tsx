"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { Button } from "./button";

/**
 * Shown in place of (or alongside) a generic error message wherever an
 * API call fails with EMAIL_NOT_VERIFIED — the account is real and
 * signed in, it just hasn't confirmed its email yet, which this app
 * requires only for a specific set of actions (see requireVerifiedEmail
 * on the API side: Clinical Brief generation/download, data export,
 * organization invites — never login, the dashboard, symptom tracking,
 * or history). Not a page-level gate: the caller decides where this
 * appears, matching how every other inline error already works in
 * this app.
 */
export function EmailVerificationRequired({ email }: { email: string }) {
  const t = useTranslations("EmailVerification");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setResendError(null);
    setResending(true);
    try {
      await api.auth.resendVerification(email);
      setResendDone(true);
    } catch (err) {
      setResendError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setResending(false);
    }
  }

  return (
    <div role="alert" className="mt-3 rounded border border-border-subtle bg-primary/5 p-4">
      <p className="text-sm font-medium text-foreground">{t("title")}</p>
      <p className="mt-1 text-sm text-foreground/70">{t("body")}</p>
      {resendDone ? (
        <p className="mt-3 text-sm text-foreground">{t("resendSuccess")}</p>
      ) : (
        <Button
          variant="ghost"
          onClick={() => void handleResend()}
          disabled={resending}
          className="mt-3 px-0 underline underline-offset-2 hover:bg-transparent"
        >
          {resending ? t("resendSubmitting") : t("resend")}
        </Button>
      )}
      {resendError && <p className="mt-2 text-sm font-medium text-foreground">{resendError}</p>}
    </div>
  );
}
