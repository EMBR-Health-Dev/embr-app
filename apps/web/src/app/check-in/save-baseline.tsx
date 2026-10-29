"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "../../components/button";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { toIsoDate } from "../../lib/date-format";
import { DEFAULT_LOCALE, isLocale } from "../../i18n/locale";
import { baselineRequest, type FirstCheckInAnswers } from "../../lib/first-check-in";
import { EARLY_ACCESS_HREF, REGISTRATION_OPEN } from "../../lib/registration";
import { browserTimeZone } from "../../lib/symptom-evidence";

const primaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-sm bg-foreground px-5 text-sm font-medium text-background hover:bg-graphite-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "exists"; completedOn: string }
  | { kind: "failed" };

export function useLongDate() {
  const locale = useLocale();
  return (isoDate: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(`${isoDate}T12:00:00`));
}

/**
 * The way to keep her answers. Signed in: one save, which the server
 * accepts only with current health consent. Signed out: sign up (or log
 * in) in this same tab, so the answers are still here when she comes
 * back. While sign up is closed: early access, which sends nothing.
 *
 * Her answers leave the tab only once the server confirms her baseline
 * exists (saved now, or already there). Any error keeps them.
 */
export function SaveBaseline({
  answers,
  onSaved,
}: {
  answers: FirstCheckInAnswers;
  onSaved: (completedOn: string) => void;
}) {
  const t = useTranslations("FirstCheckIn.save");
  const tResult = useTranslations("FirstCheckIn.result");
  const rawLocale = useLocale();
  const { user, loading } = useAuth();
  const longDate = useLongDate();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function save() {
    if (state.kind === "saving") return; // a second tap while the first is in flight
    setState({ kind: "saving" });
    try {
      const { baseline, created } = await api.baselineCheckIns.save(
        baselineRequest(
          answers,
          toIsoDate(new Date()),
          browserTimeZone(),
          isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE,
        ),
      );
      if (created) onSaved(baseline.completedOn);
      else setState({ kind: "exists", completedOn: baseline.completedOn });
    } catch (err) {
      // Missing consent is handed to the consent screen by the API
      // client, which brings her back here; anything else stays here.
      if (err instanceof ApiError && err.code === "CONSENT_REQUIRED") {
        setState({ kind: "idle" });
      } else {
        setState({ kind: "failed" });
      }
    }
  }

  if (loading) return null;

  if (user) {
    if (state.kind === "exists") {
      return (
        <p role="status" className="rounded-sm border border-border-subtle p-3 text-sm">
          {t("existsBody", { date: longDate(state.completedOn) })}
        </p>
      );
    }
    return (
      <>
        <Button className="min-h-11" onClick={() => void save()} disabled={state.kind === "saving"}>
          {state.kind === "saving"
            ? t("saving")
            : state.kind === "failed"
              ? t("retry")
              : t("saveAction")}
        </Button>
        {state.kind === "failed" ? (
          <p role="alert" className="text-sm text-foreground">
            {t("errorBody")}
          </p>
        ) : (
          <p className="text-caption text-foreground/60">{t("saveNote")}</p>
        )}
      </>
    );
  }

  if (REGISTRATION_OPEN) {
    return (
      <>
        <Link href="/register?redirect=%2Fcheck-in" className={primaryLink}>
          {t("signUpAction")}
        </Link>
        <p className="text-caption text-foreground/60">{t("signUpNote")}</p>
        <Link
          href="/login?redirect=%2Fcheck-in"
          className="text-center text-sm font-medium text-foreground underline underline-offset-2"
        >
          {t("logInToSave")}
        </Link>
      </>
    );
  }

  return (
    <>
      <a href={EARLY_ACCESS_HREF} className={primaryLink}>
        {tResult("earlyAccess")}
      </a>
      <p className="text-caption text-foreground/60">{tResult("earlyAccessNote")}</p>
      <Link
        href="/login?redirect=%2Fcheck-in"
        className="text-center text-sm font-medium text-foreground underline underline-offset-2"
      >
        {t("logInToSave")}
      </Link>
    </>
  );
}
