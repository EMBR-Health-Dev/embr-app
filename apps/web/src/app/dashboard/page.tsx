"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  ClinicalBriefListItemDto,
  OnboardingProfileDto,
  SymptomFrequencyDto,
  SymptomLogDto,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { AppNav } from "../../components/app-nav";
import { SectionLabel } from "../../components/section-label";
import { ReflectionsSection } from "../../components/reflections-section";
import { startingPointMessageKey } from "../../lib/onboarding-starting-point";
import { toIsoDate } from "../../lib/date-format";

const CATEGORIES = [
  "HOT_FLASH",
  "NIGHT_SWEATS",
  "MOOD_CHANGE",
  "SLEEP_DISTURBANCE",
  "BRAIN_FOG",
  "JOINT_PAIN",
  "FATIGUE",
  "ANXIETY",
  "IRREGULAR_HEARTBEAT",
  "VAGINAL_DRYNESS",
  "LIBIDO_CHANGE",
  "WEIGHT_CHANGE",
  "HEADACHE",
  "OTHER",
] as const;

const SEVERITIES = ["MILD", "MODERATE", "SEVERE"] as const;
const FLOWS = ["SPOTTING", "LIGHT", "MEDIUM", "HEAVY"] as const;
const LOGS_PAGE_SIZE = 10;

function isCategory(value: string | null): value is (typeof CATEGORIES)[number] {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

function DashboardContent() {
  const t = useTranslations("Dashboard");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, logout } = useAuth();

  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [loadMoreLogsError, setLoadMoreLogsError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [loggingHotFlash, setLoggingHotFlash] = useState(false);
  const [logSubmitError, setLogSubmitError] = useState<string | null>(null);
  const [managesOrg, setManagesOrg] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfileDto | null>(null);
  const [weeklyFrequency, setWeeklyFrequency] = useState<SymptomFrequencyDto[]>([]);
  const [latestBrief, setLatestBrief] = useState<ClinicalBriefListItemDto | null>(null);
  // Bumped on every successful log submission — ReflectionsSection
  // re-fetches whenever this changes. Same "acknowledge right after
  // logging" contract as apps/mobile/app/(app)/index.tsx's identical
  // refreshKey.
  const [reflectionsRefreshKey, setReflectionsRefreshKey] = useState(0);

  const suggestedCategory = searchParams.get("logCategory");
  const wantsFirstLog = searchParams.get("firstLog") !== null || Boolean(suggestedCategory);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    isCategory(suggestedCategory) ? suggestedCategory : "BRAIN_FOG",
  );
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("MODERATE");
  const [notes, setNotes] = useState("");
  const [formOpen, setFormOpen] = useState(wantsFirstLog);
  const [submitting, setSubmitting] = useState(false);

  const [flow, setFlow] = useState<(typeof FLOWS)[number] | "">("");
  const [periodStart, setPeriodStart] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleSaved, setCycleSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Soft, not a block: /onboarding's skip link reaches this same
  // dashboard in one tap from any screen, and completing/skipping sets
  // onboardingCompletedAt either way, so this redirect only ever fires
  // once per person, not on every visit.
  useEffect(() => {
    if (!loading && user && !user.onboardingCompletedAt) router.replace("/onboarding");
  }, [loading, user, router]);

  useEffect(() => {
    // Matches React's own documented fetch-on-mount pattern — see the
    // equivalent suppression in apps/admin/dashboard/page.tsx for the
    // full reasoning. Only reachable once onboardingCompletedAt is set
    // (the redirect above sends anyone else to /onboarding first), so
    // there's always a real profile to fetch by the time this runs.
    if (user?.onboardingCompletedAt) {
      api.onboarding
        .get()
        .then(setOnboardingProfile)
        .catch(() => setOnboardingProfile(null));
    }
  }, [user]);

  // Always resets back to the first page of 10 — the right behavior
  // both on initial mount and after logging something new, since a
  // fresh entry means "what's most recent" changed and any earlier
  // "Load more" expansion is no longer the most useful view.
  async function loadLogs() {
    setLogsLoading(true);
    setLoadMoreLogsError(null);
    try {
      const page = await api.symptomLogs.list({ page: 1, pageSize: LOGS_PAGE_SIZE });
      setLogs(page.items);
      setLogsPage(1);
      setLogsTotalPages(page.totalPages);
    } finally {
      setLogsLoading(false);
    }
  }

  // Fetches the next page from the server and appends it — the full
  // history genuinely lives server-side (see symptom.routes.ts's
  // pagination), this never just reveals something already fetched.
  async function loadMoreLogs() {
    setLoadingMoreLogs(true);
    setLoadMoreLogsError(null);
    try {
      const nextPage = logsPage + 1;
      const page = await api.symptomLogs.list({ page: nextPage, pageSize: LOGS_PAGE_SIZE });
      setLogs((prev) => [...prev, ...page.items]);
      setLogsPage(nextPage);
      setLogsTotalPages(page.totalPages);
    } catch (err) {
      setLoadMoreLogsError(err instanceof ApiError ? err.message : t("loadMoreError"));
    } finally {
      setLoadingMoreLogs(false);
    }
  }

  // The smallest possible ongoing reflection: how many logs this week
  // and the most common category, reusing the same server-side
  // aggregate the Trends page already calls (Milestone 9) rather than
  // adding a new endpoint for a single summary line. This is a
  // separate, narrower thing from the /reflections feature below
  // (four richer, dismissible reflection types) — not a substitute
  // for it.
  async function loadWeeklyFrequency() {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    try {
      const frequency = await api.trends.symptomFrequency({ from: from.toISOString() });
      return frequency;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    // Matches React's own documented fetch-on-mount pattern — see the
    // equivalent suppression in apps/admin/dashboard/page.tsx for the
    // full reasoning.
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadLogs();
      void loadWeeklyFrequency().then(setWeeklyFrequency);
    }
  }, [user]);

  // Most people aren't an ORG_ADMIN of anything — only show the link
  // if this one extra call actually finds one, rather than always
  // linking to a page that'll just say "not applicable" for everyone.
  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  // Powers the Evidence section's CTA copy (view vs. generate-first) —
  // a plain existence check, nothing recomputed or interpreted here.
  useEffect(() => {
    if (!user) return;
    api.briefs
      .list({ pageSize: 1 })
      .then((page) => setLatestBrief(page.items[0] ?? null))
      .catch(() => setLatestBrief(null));
  }, [user]);

  async function logHotFlashNow() {
    // Guards against a double-tap or a slow/retried request creating
    // two near-identical records — there's no server-side idempotency
    // check for symptom logs (unlike cycle entries' unique-per-day
    // upsert), so this is the only thing preventing a duplicate here.
    if (loggingHotFlash) return;
    setLoggingHotFlash(true);
    try {
      await api.symptomLogs.create({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date().toISOString(),
      });
      setConfirmation(t("hotFlashConfirmation"));
      const [, frequency] = await Promise.all([loadLogs(), loadWeeklyFrequency()]);
      setWeeklyFrequency(frequency);
      setReflectionsRefreshKey((key) => key + 1);
    } catch (err) {
      setConfirmation(err instanceof ApiError ? err.message : t("hotFlashError"));
    } finally {
      setLoggingHotFlash(false);
    }
  }

  async function handleLogSubmit() {
    setSubmitting(true);
    setLogSubmitError(null);
    try {
      await api.symptomLogs.create({
        category,
        severity,
        occurredAt: new Date().toISOString(),
        notes: notes.trim() || undefined,
      });
      setNotes("");
      setFormOpen(false);
      setConfirmation(t("logConfirmation"));
      const [, frequency] = await Promise.all([loadLogs(), loadWeeklyFrequency()]);
      setWeeklyFrequency(frequency);
      setReflectionsRefreshKey((key) => key + 1);
    } catch (err) {
      // Stays visible next to the form itself, not in the TODAY hero
      // above — that's where confirmation renders, but a person who
      // scrolled down to fill out this form shouldn't have to scroll
      // back up to find out it failed.
      setLogSubmitError(err instanceof ApiError ? err.message : t("logError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCycleEntry() {
    setCycleSaving(true);
    try {
      await api.cycleEntries.upsert({
        date: toIsoDate(new Date()),
        flow: flow || undefined,
        isPeriodStart: periodStart,
        isPeriodEnd: periodEnd,
      });
      setCycleSaved(true);
    } finally {
      setCycleSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const startingPointKey = startingPointMessageKey(onboardingProfile?.jobToBeDone ?? null);
  const todayIso = toIsoDate(new Date());
  const todaysLogs = logs.filter((log) => toIsoDate(new Date(log.occurredAt)) === todayIso);
  const todayLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        {startingPointKey && (
          <p className="font-display text-heading-m italic text-foreground/80">
            {t(startingPointKey)}
          </p>
        )}

        {/* ---- TODAY ---- */}
        <section className={startingPointKey ? "mt-10" : ""}>
          <SectionLabel as="h1">
            {t("todayLabel")} · {todayLabel}
          </SectionLabel>

          <div className="mt-6 flex flex-col items-center gap-3 rounded border border-primary bg-primary/5 py-12 text-center">
            {/* Signature interaction: one tap, no form, for the moment
                that actually needs it — mid-hot-flash is not when
                anyone wants to fill out a category picker. */}
            <button
              onClick={() => void logHotFlashNow()}
              disabled={loggingHotFlash}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_6px_rgb(var(--color-lilac-500)/0.15)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring active:scale-95 disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:scale-100"
              aria-label={t("hotFlashAriaLabel")}
              aria-busy={loggingHotFlash}
            >
              <span className="text-3xl" aria-hidden="true">
                ◉
              </span>
            </button>
            <p className="font-display text-heading-m text-foreground">{t("hotFlashPrompt")}</p>
            <p className="text-sm text-foreground/60">{t("hotFlashHint")}</p>
            {confirmation && (
              <p role="status" className="text-sm font-medium text-foreground">
                {confirmation}
              </p>
            )}

            {!confirmation && (
              <p className="mt-2 text-sm text-foreground/60">
                {todaysLogs.length > 0
                  ? t("todayLoggedSummary", { count: todaysLogs.length })
                  : t("todayEmptyTitle")}
              </p>
            )}
            {!confirmation && todaysLogs.length === 0 && (
              <p className="max-w-xs text-xs text-foreground/45">{t("todayEmptyHint")}</p>
            )}
          </div>
        </section>

        {/* ---- YOUR RECORD ---- */}
        <section className="mt-14">
          <SectionLabel>{t("yourRecordLabel")}</SectionLabel>

          <div className="mt-6">
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="text-sm font-medium text-foreground underline underline-offset-2"
            >
              {formOpen ? t("close") : t("logDifferentSymptom")}
            </button>

            {formOpen && (
              <div className="mt-4 flex flex-col gap-4 rounded border border-border-subtle p-5">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("symptomLabel")}</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                    className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {tEnum(`category.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Not a <label> wrapping three buttons — a label is only
                    meant to associate with a single form control, and
                    wrapping several here produced an unpredictable
                    accessible name (confirmed directly: the browser's
                    own accessibility tree exposed "Severity" as part of
                    more than one button's computed name). A labelled
                    group is the correct shape for a set of toggle
                    buttons acting as one selection. */}
                <div
                  role="group"
                  aria-labelledby="severity-group-label"
                  className="flex flex-col gap-1.5 text-sm"
                >
                  <span id="severity-group-label" className="font-medium text-foreground">
                    {t("severityLabel")}
                  </span>
                  <div className="flex gap-2">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeverity(s)}
                        aria-pressed={severity === s}
                        className={`flex-1 rounded-sm border px-3 py-2 text-sm ${
                          severity === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-foreground"
                        }`}
                      >
                        {tEnum(`severity.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("notesLabel")}</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>

                {logSubmitError && (
                  <p
                    role="alert"
                    className="text-sm font-medium text-foreground underline decoration-destructive underline-offset-4"
                  >
                    {logSubmitError}
                  </p>
                )}

                <Button onClick={handleLogSubmit} disabled={submitting}>
                  {submitting ? t("saving") : t("save")}
                </Button>
              </div>
            )}
          </div>

          {/* Cycle quick-log for today. */}
          <div className="mt-6 rounded border border-border-subtle p-5">
            <h3 className="font-display text-body-l text-foreground">{t("todaysCycleEntry")}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">{t("flowLabel")}</span>
                <select
                  value={flow}
                  onChange={(e) => {
                    setFlow(e.target.value as (typeof FLOWS)[number] | "");
                    setCycleSaved(false);
                  }}
                  className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="">{t("flowNone")}</option>
                  {FLOWS.map((f) => (
                    <option key={f} value={f}>
                      {tEnum(`flow.${f}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.checked);
                    setCycleSaved(false);
                  }}
                />
                {t("periodStartedToday")}
              </label>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.checked);
                    setCycleSaved(false);
                  }}
                />
                {t("periodEndedToday")}
              </label>
            </div>
            <Button
              variant="ghost"
              onClick={saveCycleEntry}
              disabled={cycleSaving}
              className="mt-4"
            >
              {cycleSaving ? t("saving") : cycleSaved ? t("saved") : t("saveTodaysEntry")}
            </Button>
          </div>

          {/* Recent history. */}
          <div className="mt-10">
            <h3 className="font-display text-body-l text-foreground">{t("recentSymptoms")}</h3>
            {logsLoading ? (
              <p className="mt-3 text-sm text-foreground/50">{tCommon("loading")}</p>
            ) : logs.length === 0 ? (
              <p className="mt-3 text-sm text-foreground/50">{t("noLogsYet")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border-subtle">
                {logs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <span className="font-medium text-foreground">
                        {tEnum(`category.${log.category}`)}
                      </span>
                      <span className="ml-2 text-foreground/50">
                        {tEnum(`severity.${log.severity}`)}
                      </span>
                      {log.notes && <p className="mt-1 text-foreground/60">{log.notes}</p>}
                    </div>
                    <time className="text-foreground/40" dateTime={log.occurredAt}>
                      {new Date(log.occurredAt).toLocaleString(locale, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            {!logsLoading && logs.length > 0 && logsPage < logsTotalPages && (
              <button
                onClick={() => void loadMoreLogs()}
                disabled={loadingMoreLogs}
                className="mt-3 text-sm font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
              >
                {loadingMoreLogs ? tCommon("loading") : t("loadMore")}
              </button>
            )}
            {loadMoreLogsError && (
              <p role="alert" className="mt-2 text-sm font-medium text-foreground">
                {loadMoreLogsError}
              </p>
            )}
          </div>
        </section>

        {/* ---- PATTERNS ---- */}
        <section className="mt-14">
          <SectionLabel>{t("patternsLabel")}</SectionLabel>
          <p className="mt-2 text-sm text-foreground/60">{t("patternsBody")}</p>

          {weeklyFrequency.length > 0 && (
            <p className="mt-4 text-sm font-medium text-foreground">
              {t("thisWeek", { count: weeklyFrequency.reduce((sum, f) => sum + f.count, 0) })}
              {" · "}
              {t("mostCommon", { category: tEnum(`category.${weeklyFrequency[0].category}`) })}
            </p>
          )}

          <div className="mt-6">
            <ReflectionsSection refreshKey={reflectionsRefreshKey} />
          </div>

          <Link
            href="/trends"
            className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-2"
          >
            {t("viewPatterns")}
          </Link>
        </section>

        {/* ---- EVIDENCE ---- */}
        {/* Visually echoes the Clinical Brief PDF's own masthead (same
            SectionLabel signal-dot treatment, same graphite/lilac
            palette) — the point being that this card and the document
            it links to read as one system. */}
        <section className="mb-16 mt-14 rounded border border-border bg-surface p-6">
          <SectionLabel>{t("evidenceLabel")}</SectionLabel>
          <p className="mt-3 max-w-md text-sm text-foreground/70">{t("evidenceBody")}</p>
          <Link href="/brief" className="mt-5 inline-block">
            <Button>{latestBrief ? t("viewClinicalBrief") : t("generateFirstBrief")}</Button>
          </Link>
        </section>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("Common");
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-foreground/50">{t("loading")}</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
