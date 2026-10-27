"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { MrsCheckInDto, MrsItem, MrsScoresDto } from "@embr/types";
import { MRS_ITEMS } from "@embr/validation";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { toIsoDate } from "../../lib/date-format";
import { formatHistoryDate } from "../../lib/symptom-history-format";
import { MRS_INTERVAL_DAYS, isMrsDue, mrsAvailable } from "../../lib/mrs";
import { Button } from "../../components/button";
import { AppNav } from "../../components/app-nav";

const ANSWERS = [0, 1, 2, 3, 4] as const;
const SUBSCALES = ["somatic", "psychological", "urogenital"] as const;
const MAX: Record<keyof MrsScoresDto, number> = {
  total: 44,
  somatic: 16,
  psychological: 16,
  urogenital: 12,
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The monthly Menopause Rating Scale check-in: the 11 questions in the
 * instrument's own English wording, then her scores and how they have
 * changed. Numbers only on her screens, never a severity label: EMBR
 * describes, it does not diagnose. Hidden unless the build's switch is
 * on and the language is English (see lib/mrs.ts).
 */
export default function MonthlyRatingPage() {
  const t = useTranslations("MrsCheckIn");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [managesOrg, setManagesOrg] = useState(false);
  const available = mrsAvailable(locale);

  const [today] = useState(() => toIsoDate(new Date()));
  const [checkIns, setCheckIns] = useState<MrsCheckInDto[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [answers, setAnswers] = useState<Partial<Record<MrsItem, number>>>({});
  const [answering, setAnswering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDate, setConfirmingDate] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!available) router.replace("/dashboard");
  }, [available, router]);

  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId || !available) return;
    api.mrsCheckIns
      .list()
      .then((rows) => {
        setCheckIns(rows);
        setAnswering(isMrsDue(rows, today));
        setListState("ready");
      })
      .catch(() => setListState("error"));
  }, [userId, available, today]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !user || !available) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const answered = MRS_ITEMS.filter((item) => answers[item] !== undefined).length;
  const complete = answered === MRS_ITEMS.length;
  const date = (iso: string) => formatHistoryDate(locale, iso);
  const sorted = [...checkIns].sort((a, b) => a.completedOn.localeCompare(b.completedOn));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const todays = checkIns.find((c) => c.completedOn === today);

  function startAnswering() {
    setAnswers(todays ? { ...todays.answers } : {});
    setError(null);
    setAnswering(true);
  }

  async function save() {
    if (!complete) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.mrsCheckIns.save(today, answers as Record<MrsItem, number>);
      setCheckIns((rows) => [...rows.filter((c) => c.completedOn !== today), saved]);
      setAnswers({});
      setAnswering(false);
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(completedOn: string) {
    setError(null);
    try {
      await api.mrsCheckIns.delete(completedOn);
      setCheckIns((rows) => rows.filter((c) => c.completedOn !== completedOn));
      setConfirmingDate(null);
    } catch {
      setError(t("deleteFailed"));
    }
  }

  function change(key: keyof MrsScoresDto): string | null {
    if (!latest || !previous) return null;
    const diff = latest.scores[key] - previous.scores[key];
    const on = date(previous.completedOn);
    if (diff === 0) return t("changeSame", { date: on });
    return t(diff > 0 ? "changeHigher" : "changeLower", { diff: Math.abs(diff), date: on });
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-body-s text-foreground/60">{t("intro")}</p>

        {listState === "error" && (
          <p role="alert" className="mt-6 text-body-s text-foreground">
            {t("loadError")}
          </p>
        )}

        {listState === "ready" && answering && (
          <form
            className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2 className="font-display text-heading-m text-foreground">{t("dueHeading")}</h2>
            <p className="mt-2 text-body-s font-medium text-foreground">{t("question")}</p>
            <p className="mt-1 text-caption text-foreground/60">{t("instruction")}</p>

            <div className="mt-5 flex flex-col divide-y divide-border-subtle">
              {MRS_ITEMS.map((item) => (
                <fieldset key={item} className="py-4">
                  <legend className="text-body-s font-medium text-foreground">
                    {t(`item.${item}.label`)}
                    <span className="block text-caption font-normal text-foreground/60">
                      {t(`item.${item}.detail`)}
                    </span>
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {ANSWERS.map((value) => (
                      <label key={value} className="cursor-pointer">
                        <input
                          type="radio"
                          name={`mrs-${item}`}
                          className="peer sr-only"
                          checked={answers[item] === value}
                          disabled={saving}
                          onChange={() => setAnswers((a) => ({ ...a, [item]: value }))}
                        />
                        <span className="flex min-h-11 items-center justify-center rounded-sm border border-border px-2 py-1.5 text-center text-sm text-foreground/80 transition-colors peer-checked:border-lilac-700 peer-checked:bg-lilac-100 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                          {t(`answer.${value}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-body-s text-foreground">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={!complete || saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              <span aria-live="polite" className="text-caption text-foreground/60">
                {t("progress", { answered })}
              </span>
              {checkIns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAnswering(false)}
                  className="min-h-11 text-body-s text-foreground/70 underline-offset-4 hover:underline"
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          </form>
        )}

        {listState === "ready" && latest && (
          <section
            aria-labelledby="mrs-scores"
            className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6"
          >
            <h2 id="mrs-scores" className="font-display text-heading-m text-foreground">
              {t("scoresHeading")}
            </h2>
            <p className="mt-1 text-caption text-foreground/60">
              {t("latestOn", { date: date(latest.completedOn) })}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {(["total", ...SUBSCALES] as const).map((key) => (
                <div key={key} className="rounded-md border border-border-subtle p-4">
                  <dt className="text-caption text-foreground/70">
                    {key === "total" ? t("total") : t(`subscale.${key}`)}
                  </dt>
                  <dd className="mt-1 whitespace-nowrap font-mono text-lg tabular-nums text-foreground sm:text-heading-m">
                    {t("outOf", { score: latest.scores[key], max: MAX[key] })}
                  </dd>
                  {change(key) && (
                    <dd className="mt-1 text-caption text-foreground/60">{change(key)}</dd>
                  )}
                </div>
              ))}
            </dl>
            <p className="mt-4 max-w-prose text-caption text-foreground/60">{t("scoresHint")}</p>

            {!answering && (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                {isMrsDue(checkIns, today) || todays ? (
                  <Button type="button" variant="ghost" onClick={startAnswering}>
                    {todays ? t("answerAgain") : t("dueHeading")}
                  </Button>
                ) : (
                  <>
                    <p className="text-body-s text-foreground/70">
                      {t("notDue", {
                        date: date(addDays(latest.completedOn, MRS_INTERVAL_DAYS)),
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={startAnswering}
                      className="min-h-11 text-body-s text-foreground/70 underline-offset-4 hover:underline"
                    >
                      {t("startEarly")}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {listState === "ready" && sorted.length > 0 && (
          <section aria-labelledby="mrs-history" className="mt-8">
            <h2 id="mrs-history" className="font-display text-heading-m text-foreground">
              {t("historyHeading")}
            </h2>
            <ol className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
              {[...sorted].reverse().map((c) => (
                <li
                  key={c.completedOn}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="text-body-s font-medium text-foreground">
                    {date(c.completedOn)}
                  </span>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-foreground/70">
                    {(["total", ...SUBSCALES] as const).map((key) => (
                      <div key={key} className="flex gap-1">
                        <dt>{key === "total" ? t("total") : t(`subscale.${key}`)}</dt>
                        <dd className="font-mono tabular-nums text-foreground">{c.scores[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    aria-label={t("deleteFor", { date: date(c.completedOn) })}
                    onClick={() => setConfirmingDate(c.completedOn)}
                    className="min-h-11 text-caption text-foreground/60 underline-offset-4 hover:underline"
                  >
                    {t("delete")}
                  </button>
                </li>
              ))}
            </ol>
            {confirmingDate && (
              <div role="alertdialog" className="mt-3 rounded-md border border-border p-4">
                <p className="text-body-s text-foreground">
                  {t("confirmDelete", { date: date(confirmingDate) })}
                </p>
                <div className="mt-3 flex gap-3">
                  <Button type="button" onClick={() => void remove(confirmingDate)}>
                    {t("confirmDeleteYes")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmingDate(null)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}
            {error && !answering && (
              <p role="alert" className="mt-3 text-body-s text-foreground">
                {error}
              </p>
            )}
          </section>
        )}

        <p className="mt-10 max-w-prose text-caption text-foreground/50">{t("copyright")}</p>
      </main>
    </div>
  );
}
