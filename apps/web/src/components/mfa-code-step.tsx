"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { AuthSessionResponse } from "@embr/types";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { Button } from "./button";
import { Field } from "./field";

/**
 * The second step of sign in, shared by the password and email link
 * pages: the 6 digit code from her authenticator app, or one of her
 * recovery codes. The server allows 5 minutes and 5 codes; once the
 * challenge is gone (a 401) she starts sign in again.
 */
export function MfaCodeStep({
  mfaToken,
  onSignedIn,
  onRestart,
}: {
  mfaToken: string;
  onSignedIn: (session: AuthSessionResponse) => Promise<void> | void;
  onRestart: () => void;
}) {
  const t = useTranslations("Mfa");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError(useRecovery ? t("enterRecoveryCode") : t("enterCode"));
      return;
    }
    setSubmitting(true);
    try {
      const session = await api.auth.completeMfa({ mfaToken, code: trimmed });
      await onSignedIn(session);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setEnded(err.message);
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t("wrongCode"));
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
      setSubmitting(false);
    }
  }

  if (ended) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display-m text-foreground">{t("title")}</h1>
        <p role="alert" className="mt-6 text-sm font-medium text-foreground">
          {ended}
        </p>
        <Button onClick={onRestart} className="mt-6 w-full">
          {t("startAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-display-m text-foreground">{t("title")}</h1>
      <p className="mt-3 text-sm text-foreground/60">
        {useRecovery ? t("recoverySubtitle") : t("subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5" noValidate>
        <Field
          key={useRecovery ? "recovery" : "totp"}
          label={useRecovery ? t("recoveryCodeLabel") : t("codeLabel")}
          autoComplete="one-time-code"
          inputMode={useRecovery ? "text" : "numeric"}
          autoCapitalize={useRecovery ? "characters" : "off"}
          spellCheck={false}
          autoFocus
          maxLength={useRecovery ? 20 : 7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? t("verifying") : t("verify")}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2 sm:min-h-0"
      >
        {useRecovery ? t("useApp") : t("useRecovery")}
      </button>
      <p className="mt-3 text-xs text-foreground/60">{t("lostBoth")}</p>
    </div>
  );
}
