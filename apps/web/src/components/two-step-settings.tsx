"use client";

import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import type { MfaSetupDto, MfaStatusDto } from "@embr/types";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { MFA_SETUP_ENABLED } from "../lib/mfa";
import { Button } from "./button";
import { Field } from "./field";

type Mode =
  | { kind: "idle" }
  | { kind: "setup"; setup: MfaSetupDto; qr: string | null }
  | { kind: "codes"; codes: string[] }
  | { kind: "regenerate" }
  | { kind: "disable" };

/** The secret in groups of four, easier to type into an app by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Two-step sign in in Settings. Turning it on is two steps (scan, then
 * a first code), so a half finished setup changes nothing. Recovery
 * codes are shown once, right after, with copy and download. While
 * NEXT_PUBLIC_MFA_SETUP_ENABLED is off the section is hidden unless
 * she already has it on, so she can always manage or turn it off.
 */
export function TwoStepSettings() {
  const t = useTranslations("TwoStep");
  const [status, setStatus] = useState<MfaStatusDto | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function load() {
    api.auth.mfa
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }
  useEffect(load, []);

  function reset(next: Mode = { kind: "idle" }) {
    setMode(next);
    setCode("");
    setPassword("");
    setError(null);
    setCopied(false);
  }

  if (!status) return null;
  if (!status.enabled && !MFA_SETUP_ENABLED && mode.kind !== "codes") return null;

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const setup = await api.auth.mfa.setup();
      // A data URL made in the browser: the secret never leaves this page.
      const qr = await QRCode.toDataURL(setup.otpauthUri, {
        margin: 1,
        width: 192,
        errorCorrectionLevel: "M",
      }).catch(() => null);
      reset({ kind: "setup", setup, qr });
    } catch (err) {
      setError(errorText(err, t("genericError")));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{3}\s?\d{3}$/.test(code.trim())) {
      setError(t("enterSixDigits"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { recoveryCodes } = await api.auth.mfa.confirm(code.trim());
      reset({ kind: "codes", codes: recoveryCodes });
      load();
    } catch (err) {
      setError(errorText(err, t("genericError")));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError(t("enterCode"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { recoveryCodes } = await api.auth.mfa.regenerateRecoveryCodes(code.trim());
      reset({ kind: "codes", codes: recoveryCodes });
      load();
    } catch (err) {
      setError(errorText(err, t("genericError")));
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    if (!password || !code.trim()) {
      setError(t("enterPasswordAndCode"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.mfa.disable({ password, code: code.trim() });
      reset();
      load();
    } catch (err) {
      setError(errorText(err, t("genericError")));
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadCodes(codes: string[]) {
    const text = `${t("downloadHeading")}\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "embr-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const errorLine = error && (
    <p role="alert" className="text-sm font-medium text-foreground">
      {error}
    </p>
  );
  const cancel = (
    <button
      type="button"
      onClick={() => reset()}
      disabled={busy}
      className="inline-flex min-h-11 items-center text-sm text-foreground/60 underline underline-offset-2 disabled:opacity-50 sm:min-h-0"
    >
      {t("cancel")}
    </button>
  );

  return (
    <section className="mt-10" aria-labelledby="two-step-title">
      <h2 id="two-step-title" className="font-display text-heading-m text-foreground">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-foreground/60">{t("description")}</p>

      {mode.kind === "codes" ? (
        <div className="mt-4 rounded border border-border-subtle bg-surface p-4">
          <h3 className="font-medium text-foreground">{t("codesTitle")}</h3>
          <p className="mt-1 text-sm text-foreground/70">{t("codesHelp")}</p>
          <ul
            aria-label={t("codesTitle")}
            className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-foreground"
          >
            {mode.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => copyCodes(mode.codes)}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button variant="ghost" onClick={() => downloadCodes(mode.codes)}>
              {t("download")}
            </Button>
          </div>
          <Button onClick={() => reset()} className="mt-4">
            {t("savedThem")}
          </Button>
        </div>
      ) : mode.kind === "setup" ? (
        <form onSubmit={confirm} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-foreground">{t("scanStep")}</p>
          {mode.qr && (
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL
            <img
              src={mode.qr}
              alt={t("qrAlt")}
              width={192}
              height={192}
              className="rounded-sm border border-border-subtle bg-white"
            />
          )}
          <div className="text-sm">
            <p className="text-foreground/70">{t("manualEntry")}</p>
            <p className="mt-1 break-all font-mono text-foreground">
              {groupSecret(mode.setup.secret)}
            </p>
          </div>
          <Field
            label={t("firstCodeLabel")}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {errorLine}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? t("checking") : t("turnOn")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : mode.kind === "regenerate" ? (
        <form onSubmit={regenerate} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-foreground/70">{t("regenerateHelp")}</p>
          <Field
            label={t("codeLabel")}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {errorLine}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? t("checking") : t("getNewCodes")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : mode.kind === "disable" ? (
        <form onSubmit={disable} className="mt-4 flex flex-col gap-4" noValidate>
          <p className="text-sm text-foreground/70">{t("disableHelp")}</p>
          <Field
            label={t("passwordLabel")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t("codeLabel")}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {errorLine}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? t("checking") : t("turnOff")}
            </Button>
            {cancel}
          </div>
        </form>
      ) : status.enabled ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">{t("isOn")}</p>
          <p className="mt-1 text-sm text-foreground/70">
            {t("codesLeft", { count: status.recoveryCodesLeft })}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => reset({ kind: "regenerate" })}>
              {t("getNewCodes")}
            </Button>
            <Button variant="ghost" onClick={() => reset({ kind: "disable" })}>
              {t("turnOff")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sm text-foreground/70">{t("isOff")}</p>
          {errorLine}
          <Button onClick={startSetup} disabled={busy}>
            {busy ? t("starting") : t("setUp")}
          </Button>
        </div>
      )}
    </section>
  );
}
