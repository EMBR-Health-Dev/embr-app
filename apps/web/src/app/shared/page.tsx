"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SharedBriefDto } from "@embr/types";
import { BriefContent } from "../../components/brief-content";
import { BrandWordmark } from "../../components/brand-wordmark";
import { Button } from "../../components/button";
import { LanguageSwitcher } from "../../components/language-switcher";
import {
  SharedBriefError,
  downloadSharedBriefPdf,
  openSharedBrief,
  tokenFromHash,
} from "../../lib/shared-brief";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readToken(): string | null {
  return tokenFromHash(window.location.hash);
}

/**
 * What a clinician sees when a patient shares a BRIEF: no account, the
 * link's token from the URL fragment, and the 6 digit code the patient
 * gave them. Read only. Nothing is stored in the browser.
 */
export default function SharedBriefPage() {
  const t = useTranslations("SharedBrief");
  const locale = useLocale();
  const id = useId();
  // The token lives in the URL fragment, which only the browser knows:
  // undefined while rendering on the server, then the token or null.
  const token = useSyncExternalStore(subscribeToHash, readToken, () => undefined);
  const [code, setCode] = useState("");
  const [shared, setShared] = useState<SharedBriefDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t("codeFormat"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setShared(await openSharedBrief(token, code));
    } catch (err) {
      const status = err instanceof SharedBriefError ? err.status : 0;
      setError(
        status === 403
          ? t("wrongCode")
          : status === 429
            ? t("tooMany")
            : status === 404
              ? t("unavailable")
              : t("error"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!token || !shared) return;
    setDownloading(true);
    try {
      const blob = await downloadSharedBriefPdf(token, code);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `embr-brief-${shared.brief.fromDate}-to-${shared.brief.toDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("error"));
    } finally {
      setDownloading(false);
    }
  }

  const until = shared
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(shared.sharedUntil),
      )
    : "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <BrandWordmark className="h-[15px]" />
        <LanguageSwitcher />
      </header>

      <h1 className="mt-10 font-display text-heading-l text-foreground">{t("title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground/80">{t("intro")}</p>

      {token === null && (
        <p role="alert" className="mt-8 text-foreground">
          {t("noLink")}
        </p>
      )}

      {token && !shared && (
        <form onSubmit={submit} className="mt-8 max-w-sm" noValidate>
          <label htmlFor={`${id}-code`} className="block text-sm font-medium text-foreground">
            {t("codeLabel")}
          </label>
          <input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-describedby={`${id}-hint`}
            className="mt-1 w-full rounded-sm border border-border p-3 font-mono text-xl tracking-[0.3em]"
          />
          <p id={`${id}-hint`} className="mt-1 text-xs text-foreground/60">
            {t("codeHint")}
          </p>
          <Button type="submit" disabled={busy} className="mt-4 min-h-11">
            {busy ? t("opening") : t("open")}
          </Button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-foreground">
              {error}
            </p>
          )}
        </form>
      )}

      {shared && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle p-4 text-sm text-foreground/80">
            <p>{t("availableUntil", { date: until })}</p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void download()}
              disabled={downloading}
              className="min-h-11"
            >
              {downloading ? t("downloading") : t("downloadPdf")}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-foreground">
              {error}
            </p>
          )}
          <div className="mt-6">
            <BriefContent brief={shared.brief} />
          </div>
          <p className="mt-10 text-xs leading-relaxed text-foreground/60">{t("footer")}</p>
        </div>
      )}
    </main>
  );
}
