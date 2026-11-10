"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import type { BriefShareDto, CreatedBriefShareDto } from "@embr/types";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { Button } from "./button";

/**
 * Share one BRIEF with a clinician: a link (with a QR code for the
 * appointment) and a 6 digit code she gives them separately. The link
 * and code are shown once, right after creating, and never again. She
 * sees each link's status and how often it was opened, and can turn it
 * off at any time.
 */
export function BriefShare({ briefId }: { briefId: string }) {
  const t = useTranslations("BriefShare");
  const locale = useLocale();
  const id = useId();
  const [days, setDays] = useState<7 | 30>(7);
  const [shares, setShares] = useState<BriefShareDto[]>([]);
  const [created, setCreated] = useState<CreatedBriefShareDto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const load = useCallback(() => {
    api.briefs
      .shares(briefId)
      .then(setShares)
      .catch(() => {
        // The list is a convenience; creating still works without it.
      });
  }, [briefId]);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.briefs.createShare(briefId, days);
      setCreated(result);
      // A data URL made in the browser: the link never leaves this page.
      setQr(
        await QRCode.toDataURL(result.url, {
          margin: 1,
          width: 192,
          errorCorrectionLevel: "M",
        }).catch(() => null),
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("createError"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setError(null);
    try {
      await api.briefs.revokeShare(briefId, shareId);
      if (created?.share.id === shareId) {
        setCreated(null);
        setQr(null);
      }
      load();
    } catch {
      setError(t("revokeError"));
    }
  }

  async function copy(what: "link" | "code", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  }

  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(iso),
    );

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-6 rounded-sm border border-border-subtle p-4"
    >
      <h3 id={`${id}-title`} className="font-semibold text-foreground">
        {t("title")}
      </h3>
      <p className="mt-1 text-sm text-foreground/80">{t("intro")}</p>

      {!created && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <fieldset>
            <legend className="text-sm text-foreground/85">{t("duration")}</legend>
            <div className="mt-1 flex gap-4">
              {([7, 30] as const).map((d) => (
                <label key={d} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${id}-days`}
                    checked={days === d}
                    onChange={() => setDays(d)}
                  />
                  {t("days", { count: d })}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="button" onClick={() => void create()} disabled={busy} className="min-h-11">
            {busy ? t("creating") : t("create")}
          </Button>
        </div>
      )}

      {created && (
        <div data-testid="share-created" className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          {qr && (
            // A data URL from the qrcode library: no network request.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={t("qrAlt")}
              width={192}
              height={192}
              className="rounded-sm border border-border-subtle"
            />
          )}
          <div className="min-w-0 space-y-3 text-sm">
            <div>
              <p className="font-medium text-foreground">{t("linkLabel")}</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground/80">{created.url}</p>
              <Button
                type="button"
                variant="ghost"
                className="mt-1 min-h-11"
                onClick={() => void copy("link", created.url)}
              >
                {copied === "link" ? t("copied") : t("copyLink")}
              </Button>
            </div>
            <div>
              <p className="font-medium text-foreground">{t("codeLabel")}</p>
              <p
                className="mt-1 font-mono text-2xl tracking-[0.3em] text-foreground"
                data-testid="share-code"
              >
                {created.code}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="mt-1 min-h-11"
                onClick={() => void copy("code", created.code)}
              >
                {copied === "code" ? t("copied") : t("copyCode")}
              </Button>
            </div>
            <p className="text-foreground/80">
              {t("howTo", { date: date(created.share.expiresAt) })}
            </p>
            <p className="text-xs text-foreground/60">{t("shownOnce")}</p>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setCreated(null);
                setQr(null);
              }}
            >
              {t("done")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-foreground">
          {error}
        </p>
      )}

      {shares.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-foreground/85">{t("yourLinks")}</h4>
          <ul className="mt-1 divide-y divide-border-subtle text-sm">
            {shares.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-foreground/85">
                  {t(`status.${s.status}`)} · {t("created", { date: date(s.createdAt) })}
                  {s.status === "ACTIVE" && ` · ${t("until", { date: date(s.expiresAt) })}`}
                  {" · "}
                  {t("views", { count: s.viewCount })}
                </span>
                {s.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => void revoke(s.id)}
                    className="min-h-11 text-xs font-medium text-foreground underline decoration-destructive underline-offset-2"
                  >
                    {t("revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
