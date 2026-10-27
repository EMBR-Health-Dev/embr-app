"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  ClinicalBriefListItemDto,
  ContextLogDto,
  CycleEntryDto,
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
import { SafetyNotice } from "../../components/safety-notice";
import { startingPointMessageKey } from "../../lib/onboarding-starting-point";
import { isPostmenopause } from "../../lib/life-stage";
import { WeekOnTrack } from "../../components/week-on-track";
import { MrsDueCard } from "../../components/mrs-due-card";
import { CollapsibleCard } from "../../components/collapsible-card";
import { toIsoDate } from "../../lib/date-format";
import { RecordSpanSummary } from "../../components/record-span-summary";
import { GettingStarted } from "../../components/getting-started";
import { DailyCheckIn } from "../../components/daily-check-in";
import { SeverityMark } from "../../components/severity-mark";
import { fetchRecordSpan, type RecordSpan } from "../../lib/record-history";
import { richText } from "../../lib/rich-text";

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
// A deliberately small, fixed set of context factors (see the
// embr-clinical-logic skill doctrine) — never free text, never an
// open-ended list.
const SLEEP_DURATIONS = ["UNDER_6H", "SIX_TO_SEVEN_H", "SEVEN_PLUS_H"] as const;
const STRESS_LEVELS = ["LOW", "MODERATE", "HIGH"] as const;

/** A yes or no question that can also be left unanswered. "" is "not
 * logged", which is saved as absent, never as "no". */
type YesNo = "" | "yes" | "no";
function toYesNo(value: boolean | null | undefined): YesNo {
  return value === true ? "yes" : value === false ? "no" : "";
}
function fromYesNo(value: YesNo): boolean | undefined {
  return value === "" ? undefined : value === "yes";
}
const EXERCISE_LEVELS = ["NONE", "LIGHT", "MODERATE", "VIGOROUS"] as const;
const NIGHT_SWEATS = ["NONE", "ONE", "TWO_TO_THREE", "FOUR_PLUS"] as const;
const WORK_IMPACT = ["NONE", "DID_LESS", "MISSED_TIME"] as const;
const LOGS_PAGE_SIZE = 5;

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toIsoDate(d);
}

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
  const [duplicateHint, setDuplicateHint] = useState(false);
  const [loggingHotFlash, setLoggingHotFlash] = useState(false);
  // A short post-tap cooldown, separate from loggingHotFlash — that
  // flag only covers the in-flight request itself (milliseconds), not
  // the much more common case of a slow or shaky tap landing again
  // right after the first one already succeeded. There's still no
  // server-side idempotency for symptom logs (see logHotFlashNow's own
  // comment), so this is the only thing narrowing that window; the
  // delete button in Recent history below is what lets a real
  // duplicate that gets through anyway be corrected.
  const [hotFlashCooldown, setHotFlashCooldown] = useState(false);
  const [lastHotFlashLog, setLastHotFlashLog] = useState<SymptomLogDto | null>(null);
  const [hotFlashSeverity, setHotFlashSeverity] = useState<(typeof SEVERITIES)[number]>("MODERATE");
  const [severitySaving, setSeveritySaving] = useState(false);
  const [severityUpdated, setSeverityUpdated] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [deleteLogError, setDeleteLogError] = useState<string | null>(null);
  const [logSubmitError, setLogSubmitError] = useState<string | null>(null);
  const [managesOrg, setManagesOrg] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfileDto | null>(null);
  const postmenopause = isPostmenopause(onboardingProfile?.lifeStage);
  // Bumped after anything is saved here, so "Your week" shows it at once.
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);
  // The cycle and context forms start closed to keep the page short;
  // the week card's steps and a #cycle-entry / #context-entry link open them.
  const [openPanel, setOpenPanel] = useState<"cycle" | "context" | null>(null);
  function togglePanel(panel: "cycle" | "context") {
    setOpenPanel((current) => (current === panel ? null : panel));
  }
  useEffect(() => {
    function openFromHash() {
      if (window.location.hash === "#cycle-entry") setOpenPanel("cycle");
      if (window.location.hash === "#context-entry") setOpenPanel("context");
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  const [weeklyFrequency, setWeeklyFrequency] = useState<SymptomFrequencyDto[]>([]);
  const [latestBrief, setLatestBrief] = useState<ClinicalBriefListItemDto | null>(null);
  const [latestBriefLoaded, setLatestBriefLoaded] = useState(false);
  // Bumped on every successful log submission — ReflectionsSection
  // re-fetches whenever this changes. Same "acknowledge right after
  // logging" contract as apps/mobile/app/(app)/index.tsx's identical
  // refreshKey.
  const [reflectionsRefreshKey, setReflectionsRefreshKey] = useState(0);
  const [recordSpan, setRecordSpan] = useState<RecordSpan | null>(null);

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
  // Not editable here, but kept so saving flow or period markers
  // doesn't erase notes written for the same day elsewhere.
  const [cycleNotes, setCycleNotes] = useState<string | undefined>(undefined);
  const [cycleSaved, setCycleSaved] = useState(false);
  const [cycleError, setCycleError] = useState<string | null>(null);

  const [sleepDuration, setSleepDuration] = useState<(typeof SLEEP_DURATIONS)[number] | "">("");
  const [caffeineAfternoon, setCaffeineAfternoon] = useState<YesNo>("");
  const [alcohol, setAlcohol] = useState<YesNo>("");
  const [stressLevel, setStressLevel] = useState<(typeof STRESS_LEVELS)[number] | "">("");
  const [exercise, setExercise] = useState<(typeof EXERCISE_LEVELS)[number] | "">("");
  // Never prefilled: a blank answer means "not logged", never "none".
  const [nightSweats, setNightSweats] = useState<(typeof NIGHT_SWEATS)[number] | "">("");
  const [workImpact, setWorkImpact] = useState<(typeof WORK_IMPACT)[number] | "">("");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  // Both forms save by replacing the whole day's entry, so they open
  // with what is already recorded for today. Starting them blank would
  // let an evening save ("work: did less") wipe the morning's answers
  // (sleep, night sweats) from the record. If today's entry can't be
  // loaded, saving stays off rather than risking that; same rule as
  // apps/mobile/components/work-impact-card.tsx.
  const [contextLoad, setContextLoad] = useState<"loading" | "ready" | "failed">("loading");
  const [cycleLoad, setCycleLoad] = useState<"loading" | "ready" | "failed">("loading");
  // Context can be filled in for yesterday too (work impact after a
  // late finish, say). The day is fixed when the page opens, and each
  // day loads and saves its own entry, so one day can never overwrite
  // the other.
  const [contextToday] = useState(() => toIsoDate(new Date()));
  const [contextDay, setContextDay] = useState<"today" | "yesterday">("today");
  const contextDate = contextDay === "today" ? contextToday : dayBefore(contextToday);
  function switchContextDay(next: "today" | "yesterday") {
    if (next === contextDay) return;
    setContextDay(next);
    setContextLoad("loading");
    setContextSaved(false);
    setContextError(null);
  }
  useEffect(() => {
    if (!user?.onboardingCompletedAt) return;
    let cancelled = false;
    api.contextLogs
      .list({ from: contextDate, to: contextDate, pageSize: 1 })
      .then((page) => {
        if (cancelled) return;
        const entry = page.items.find((e: ContextLogDto) => e.date === contextDate);
        setSleepDuration(entry?.sleepDuration ?? "");
        setCaffeineAfternoon(toYesNo(entry?.caffeineAfternoon));
        setAlcohol(toYesNo(entry?.alcohol));
        setStressLevel(entry?.stressLevel ?? "");
        setExercise(entry?.exercise ?? "");
        setNightSweats(entry?.nightSweats ?? "");
        setWorkImpact(entry?.workImpact ?? "");
        setContextLoad("ready");
      })
      .catch(() => {
        if (!cancelled) setContextLoad("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [user, contextDate]);
  useEffect(() => {
    if (!user?.onboardingCompletedAt) return;
    const today = toIsoDate(new Date());
    const query = { from: today, to: today, pageSize: 1 };
    api.cycleEntries
      .list(query)
      .then((page) => {
        setCycleLoad("ready");
        const entry = page.items.find((e: CycleEntryDto) => e.date === today);
        if (!entry) return;
        setFlow(entry.flow ?? "");
        setPeriodStart(entry.isPeriodStart);
        setPeriodEnd(entry.isPeriodEnd);
        setCycleNotes(entry.notes ?? undefined);
      })
      .catch(() => setCycleLoad("failed"));
  }, [user]);

  // How far back the record goes; refreshed whenever a new entry lands
  // (same signal the weekly reflection uses).
  useEffect(() => {
    if (!user) return;
    fetchRecordSpan()
      .then(setRecordSpan)
      .catch(() => setRecordSpan(null));
  }, [user, reflectionsRefreshKey]);

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
      .catch(() => setLatestBrief(null))
      .finally(() => setLatestBriefLoaded(true));
  }, [user]);

  async function logHotFlashNow() {
    // Guards against a double-tap or a slow/retried request creating
    // two near-identical records — there's no server-side idempotency
    // check for symptom logs (unlike cycle entries' unique-per-day
    // upsert), so this, together with the post-success cooldown below,
    // is the only thing preventing a duplicate here.
    if (loggingHotFlash || hotFlashCooldown) return;
    setLoggingHotFlash(true);
    try {
      const created = await api.symptomLogs.create({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date().toISOString(),
      });
      setConfirmation(t("hotFlashConfirmation"));
      setWeekRefreshKey((key) => key + 1);
      setLastHotFlashLog(created);
      setHotFlashSeverity("MODERATE");
      setSeverityUpdated(false);
      setHotFlashCooldown(true);
      setTimeout(() => setHotFlashCooldown(false), 3000);
      const [, frequency] = await Promise.all([loadLogs(), loadWeeklyFrequency()]);
      setWeeklyFrequency(frequency);
      setReflectionsRefreshKey((key) => key + 1);
      // Informational only, not a judgment call about which tap was
      // the "real" one — a second hot flash logged minutes apart is
      // entirely plausible and not this hint's business. Anything
      // still on today's list after this reload is what actually
      // matters, and the delete button on each row below is the fix.
      const todaysHotFlashes = logs.filter(
        (log) =>
          log.category === "HOT_FLASH" &&
          toIsoDate(new Date(log.occurredAt)) === toIsoDate(new Date()),
      );
      setDuplicateHint(todaysHotFlashes.length + 1 > 1);
    } catch (err) {
      setConfirmation(err instanceof ApiError ? err.message : t("hotFlashError"));
    } finally {
      setLoggingHotFlash(false);
    }
  }

  async function adjustHotFlashSeverity(newSeverity: (typeof SEVERITIES)[number]) {
    if (!lastHotFlashLog) return;
    setHotFlashSeverity(newSeverity);
    setSeveritySaving(true);
    try {
      await api.symptomLogs.update(lastHotFlashLog.id, { severity: newSeverity });
      setSeverityUpdated(true);
      await loadLogs();
    } catch (err) {
      setConfirmation(err instanceof ApiError ? err.message : t("severityUpdateError"));
    } finally {
      setSeveritySaving(false);
    }
  }

  async function deleteLog(id: string) {
    setDeletingLogId(id);
    setDeleteLogError(null);
    try {
      await api.symptomLogs.delete(id);
      if (lastHotFlashLog?.id === id) setLastHotFlashLog(null);
      const [, frequency] = await Promise.all([loadLogs(), loadWeeklyFrequency()]);
      setWeeklyFrequency(frequency);
    } catch (err) {
      setDeleteLogError(err instanceof ApiError ? err.message : t("deleteLogError"));
    } finally {
      setDeletingLogId(null);
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
      setWeekRefreshKey((key) => key + 1);
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

  // The check in saves several entries at once: refresh what this page shows from the record.
  async function refreshAfterCheckIn() {
    setWeekRefreshKey((key) => key + 1);
    const [, frequency] = await Promise.all([loadLogs(), loadWeeklyFrequency()]);
    setWeeklyFrequency(frequency);
    setReflectionsRefreshKey((key) => key + 1);
  }

  async function saveCycleEntry() {
    setCycleSaving(true);
    setCycleError(null);
    try {
      await api.cycleEntries.upsert({
        date: toIsoDate(new Date()),
        flow: flow || undefined,
        isPeriodStart: periodStart,
        isPeriodEnd: periodEnd,
        notes: cycleNotes,
      });
      setCycleSaved(true);
      setWeekRefreshKey((key) => key + 1);
    } catch (err) {
      setCycleError(err instanceof ApiError ? err.message : t("logError"));
    } finally {
      setCycleSaving(false);
    }
  }

  async function saveContextEntry() {
    setContextSaving(true);
    setContextError(null);
    try {
      await api.contextLogs.upsert({
        date: contextDate,
        sleepDuration: sleepDuration || undefined,
        // Left as "Not logged", sent as absent: never saved as "no".
        caffeineAfternoon: fromYesNo(caffeineAfternoon),
        alcohol: fromYesNo(alcohol),
        stressLevel: stressLevel || undefined,
        nightSweats: nightSweats || undefined,
        workImpact: workImpact || undefined,
        // Sent as null when not logged, so clearing it is saved too.
        exercise: exercise || null,
      });
      setContextSaved(true);
      setWeekRefreshKey((key) => key + 1);
    } catch (err) {
      setContextError(err instanceof ApiError ? err.message : t("logError"));
    } finally {
      setContextSaving(false);
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

  // Context copy that names the day has a Yesterday twin.
  const contextKey = (key: string) => (contextDay === "today" ? key : `${key}Yesterday`);
  const contextDateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${contextDate}T12:00:00`));

  function recentDays(items: SymptomLogDto[]) {
    const days: Array<{ date: string; items: SymptomLogDto[] }> = [];
    for (const log of items) {
      const date = toIsoDate(new Date(log.occurredAt));
      const last = days[days.length - 1];
      if (last && last.date === date) last.items.push(log);
      else days.push({ date, items: [log] });
    }
    return days;
  }
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toIsoDate(d);
  })();
  function dayHeading(date: string): string {
    if (date === todayIso) return t("recentToday");
    if (date === yesterdayIso) return t("recentYesterday");
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${date}T00:00:00`));
  }

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
        {/* Ties Today/Your record, Signals, and Evidence together as
            one narrative — what you've recorded, what's changing, and
            what to bring to your healthcare provider — rather than three unrelated
            cards on one page. */}
        <p className={`text-sm text-foreground/60 ${startingPointKey ? "mt-3" : ""}`}>
          {t("homeIntro")}
        </p>

        {recordSpan && latestBriefLoaded && (
          <GettingStarted
            userId={user.id}
            accountCreatedAt={user.createdAt}
            recordStart={recordSpan.start}
            symptomCount={recordSpan.symptomCount}
            hasLifeStage={Boolean(onboardingProfile?.lifeStage)}
            hasBrief={latestBrief !== null}
          />
        )}

        {/* ---- TODAY ---- */}
        <section className="mt-10">
          <SectionLabel as="h1">
            {t("todayLabel")} · {todayLabel}
          </SectionLabel>
          <p className="mt-2 text-sm text-foreground/60">{t("todayDescription")}</p>

          <WeekOnTrack
            refreshKey={weekRefreshKey}
            postmenopause={postmenopause}
            appointmentSoon={onboardingProfile?.appointmentStatus === "WITHIN_MONTH"}
            latestBriefCreatedAt={latestBrief?.createdAt ?? null}
            onStep={(key) => {
              if (key === "cycle") setOpenPanel("cycle");
              if (key === "context") setOpenPanel("context");
            }}
          />

          <div className="mt-6 flex flex-col items-center gap-3 rounded border border-border-subtle bg-muted/40 py-8 text-center">
            {/* Signature interaction: one tap, no form, for the moment
                that actually needs it — mid-hot-flash is not when
                anyone wants to fill out a category picker. */}
            <button
              onClick={() => void logHotFlashNow()}
              disabled={loggingHotFlash || hotFlashCooldown}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-foreground text-background shadow-[0_0_0_6px_rgb(var(--color-lilac-500)/0.2)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring active:scale-95 disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:scale-100"
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
            {duplicateHint && (
              <p className="max-w-xs text-xs text-foreground/45">{t("loggedAgainHint")}</p>
            )}

            {lastHotFlashLog && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-foreground/60">
                  {t("adjustSeverity")}
                </span>
                <div className="flex gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void adjustHotFlashSeverity(s)}
                      disabled={severitySaving}
                      aria-pressed={hotFlashSeverity === s}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm disabled:opacity-60 ${
                        hotFlashSeverity === s
                          ? "border-lilac-700 bg-lilac-100 font-medium text-foreground"
                          : "border-border bg-background text-foreground/80"
                      }`}
                    >
                      <SeverityMark severity={s} />
                      {tEnum(`severity.${s}`)}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-foreground/45">
                  {severitySaving
                    ? t("severitySaving")
                    : severityUpdated
                      ? t("severityUpdated")
                      : ""}
                </span>
              </div>
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

          <div id="check-in" className="scroll-mt-6">
            <DailyCheckIn onSaved={() => void refreshAfterCheckIn()} />
          </div>

          <MrsDueCard />
        </section>

        {/* ---- YOUR RECORD ---- */}
        <section className="mt-14">
          <SectionLabel>{t("yourRecordLabel")}</SectionLabel>
          <p className="mt-2 text-sm text-foreground/60">{t("recordDescription")}</p>
          {recordSpan && <RecordSpanSummary span={recordSpan} showTimelineLink />}

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
                  <span className="text-xs text-foreground/60">
                    {t.rich("severityGuide", richText)}
                  </span>
                  <div className="flex gap-2">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeverity(s)}
                        aria-pressed={severity === s}
                        className={`inline-flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-sm border px-1 py-1.5 text-sm sm:flex-row sm:gap-2 sm:px-3 ${
                          severity === s
                            ? "border-lilac-700 bg-lilac-100 font-medium text-foreground"
                            : "border-border text-foreground/80"
                        }`}
                      >
                        <SeverityMark severity={s} />
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

          {/* Cycle quick-log for today. After menopause it becomes a
              bleeding log only: no period start or end, but bleeding
              still has a place in her record. */}
          <CollapsibleCard
            id="cycle-entry"
            title={postmenopause ? t("todaysBleedingEntry") : t("todaysCycleEntry")}
            status={
              cycleSaved ? t("saved") : postmenopause ? t("bleedingHint") : t("cycleCollapsedHint")
            }
            open={openPanel === "cycle"}
            onToggle={() => togglePanel("cycle")}
          >
            <label className="flex max-w-xs flex-col gap-1.5 text-sm">
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

            {/* Its own labeled group, visually separated from Flow above —
                flow describes an ongoing quality, while these are the
                cycle's own start/end boundary events, not variations of
                the same field. */}
            {!postmenopause && (
              <div className="mt-4 border-t border-border-subtle pt-4">
                <span className="text-sm font-medium text-foreground">{t("periodLabel")}</span>
                <div className="mt-2 flex flex-wrap gap-4">
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
                <p className="mt-2 text-xs text-foreground/45">{t("periodMiddleHint")}</p>
              </div>
            )}
            {(cycleError || cycleLoad === "failed") && (
              <p
                role="alert"
                className="mt-4 text-sm font-medium text-foreground underline decoration-destructive underline-offset-4"
              >
                {cycleError ?? t("todaysEntryLoadError")}
              </p>
            )}
            <Button
              variant="ghost"
              onClick={saveCycleEntry}
              disabled={cycleSaving || cycleLoad !== "ready"}
              className="mt-4"
            >
              {cycleSaving ? t("saving") : cycleSaved ? t("saved") : t("saveTodaysEntry")}
            </Button>
          </CollapsibleCard>

          {/* Context quick-log for today or yesterday — a deliberately
              small, fixed set of factors (see the embr-clinical-logic
              skill doctrine), never free text or an open-ended system. */}
          <CollapsibleCard
            id="context-entry"
            title={t(contextKey("todaysContextEntry"))}
            status={contextSaved ? t("saved") : t("contextCollapsedHint")}
            open={openPanel === "context"}
            onToggle={() => togglePanel("context")}
          >
            <fieldset className="mb-2">
              <legend className="sr-only">{t("contextDayLabel")}</legend>
              <div className="inline-flex rounded-sm border border-border p-0.5">
                {(["today", "yesterday"] as const).map((d) => (
                  <label key={d} className="cursor-pointer">
                    <input
                      type="radio"
                      name="context-day"
                      className="peer sr-only"
                      checked={contextDay === d}
                      disabled={contextSaving}
                      onChange={() => switchContextDay(d)}
                    />
                    <span className="inline-flex min-h-9 items-center rounded-sm px-3 text-sm text-foreground/70 transition-colors peer-checked:bg-lilac-100 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                      {t(d === "today" ? "contextDayToday" : "contextDayYesterday")}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {/* The date is spelled out so it is never a guess which day a save lands on. */}
            <p className="mb-4 text-sm text-foreground/70">
              {t.rich("contextRecordingFor", { ...richText, date: contextDateLabel })}
            </p>

            <label className="flex max-w-xs flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                {t(contextKey("sleepDurationLabel"))}
              </span>
              <select
                value={sleepDuration}
                onChange={(e) => {
                  setSleepDuration(e.target.value as (typeof SLEEP_DURATIONS)[number] | "");
                  setContextSaved(false);
                }}
                className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">{t("sleepDurationNone")}</option>
                {SLEEP_DURATIONS.map((s) => (
                  <option key={s} value={s}>
                    {tEnum(`sleepDuration.${s}`)}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
              <label htmlFor="night-sweats" className="font-medium text-foreground">
                {t(contextKey("nightSweatsLabel"))}
              </label>
              <select
                id="night-sweats"
                value={nightSweats}
                onChange={(e) => {
                  setNightSweats(e.target.value as (typeof NIGHT_SWEATS)[number] | "");
                  setContextSaved(false);
                }}
                aria-describedby="night-sweats-help"
                className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">{t("nightSweatsNone")}</option>
                {NIGHT_SWEATS.map((n) => (
                  <option key={n} value={n}>
                    {tEnum(`nightSweats.${n}`)}
                  </option>
                ))}
              </select>
              <span id="night-sweats-help" className="text-foreground/70">
                {t("nightSweatsHelp")}
              </span>
            </div>

            <label className="mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">
                {t(contextKey("stressLevelLabel"))}
              </span>
              <select
                value={stressLevel}
                onChange={(e) => {
                  setStressLevel(e.target.value as (typeof STRESS_LEVELS)[number] | "");
                  setContextSaved(false);
                }}
                className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">{t("stressLevelNone")}</option>
                {STRESS_LEVELS.map((s) => (
                  <option key={s} value={s}>
                    {tEnum(`stressLevel.${s}`)}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
              <label htmlFor="exercise" className="font-medium text-foreground">
                {t(contextKey("exerciseLabel"))}
              </label>
              <select
                id="exercise"
                value={exercise}
                onChange={(e) => {
                  setExercise(e.target.value as (typeof EXERCISE_LEVELS)[number] | "");
                  setContextSaved(false);
                }}
                aria-describedby="exercise-help"
                className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">{t("exerciseNone")}</option>
                {EXERCISE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {tEnum(`exercise.${level}`)}
                  </option>
                ))}
              </select>
              <span id="exercise-help" className="text-foreground/70">
                {t("exerciseHelp")}
              </span>
            </div>

            <div className="mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
              <label htmlFor="work-impact" className="font-medium text-foreground">
                {t(contextKey("workImpactLabel"))}
              </label>
              <select
                id="work-impact"
                value={workImpact}
                onChange={(e) => {
                  setWorkImpact(e.target.value as (typeof WORK_IMPACT)[number] | "");
                  setContextSaved(false);
                }}
                aria-describedby="work-impact-help"
                className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">{t("workImpactNone")}</option>
                {WORK_IMPACT.map((w) => (
                  <option key={w} value={w}>
                    {tEnum(`workImpact.${w}`)}
                  </option>
                ))}
              </select>
              <span id="work-impact-help" className="text-foreground/70">
                {t("workImpactHelp")}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 border-t border-border-subtle pt-4">
              {(
                [
                  [
                    "caffeine-afternoon",
                    "caffeineAfternoonLabel",
                    caffeineAfternoon,
                    setCaffeineAfternoon,
                  ],
                  ["alcohol", "alcoholLabel", alcohol, setAlcohol],
                ] as const
              ).map(([id, labelKey, value, setValue]) => (
                <label key={id} className="flex w-40 flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t(labelKey)}</span>
                  <select
                    id={id}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value as YesNo);
                      setContextSaved(false);
                    }}
                    className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
                  >
                    <option value="">{t("yesNoNotLogged")}</option>
                    <option value="yes">{t("answerYes")}</option>
                    <option value="no">{t("answerNo")}</option>
                  </select>
                </label>
              ))}
            </div>

            {(contextError || contextLoad === "failed") && (
              <p
                role="alert"
                className="mt-4 text-sm font-medium text-foreground underline decoration-destructive underline-offset-4"
              >
                {contextError ?? t(contextKey("todaysEntryLoadError"))}
              </p>
            )}
            <Button
              variant="ghost"
              onClick={saveContextEntry}
              disabled={contextSaving || contextLoad !== "ready"}
              className="mt-4"
            >
              {contextSaving
                ? t("saving")
                : contextSaved
                  ? t("saved")
                  : t(contextKey("saveTodaysEntry"))}
            </Button>
          </CollapsibleCard>

          {/* Recent history. */}
          <div className="mt-10">
            <h3 className="font-display text-body-l text-foreground">{t("recentSymptoms")}</h3>
            {logsLoading ? (
              <p className="mt-3 text-sm text-foreground/50">{tCommon("loading")}</p>
            ) : logs.length === 0 ? (
              <p className="mt-3 text-sm text-foreground/50">{t("noLogsYet")}</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-5" aria-label={t("recentSymptoms")}>
                {/* Grouped by day, newest first, like the Timeline: the day is
                    what matters in the record, not a clock time. */}
                {recentDays(logs).map(({ date, items }) => (
                  <li key={date}>
                    <h4 className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/50">
                      {dayHeading(date)}
                    </h4>
                    <ul className="mt-1.5 divide-y divide-border-subtle border-l border-lilac-300 pl-4">
                      {items.map((log) => (
                        <li
                          key={log.id}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm"
                        >
                          <div className="flex min-w-0 items-start gap-2 break-words">
                            <span className="mt-1 shrink-0 text-lilac-700">
                              <SeverityMark severity={log.severity} />
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium text-foreground">
                                {tEnum(`category.${log.category}`)}
                              </span>
                              <span className="ml-2 text-foreground/50">
                                {tEnum(`severity.${log.severity}`)}
                              </span>
                              {log.notes && <p className="mt-1 text-foreground/60">{log.notes}</p>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteLog(log.id)}
                            disabled={deletingLogId === log.id}
                            className="shrink-0 text-xs font-medium text-foreground/50 underline underline-offset-2 disabled:opacity-50"
                          >
                            {t("deleteLog")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {deleteLogError && (
              <p role="alert" className="mt-2 text-sm font-medium text-foreground">
                {deleteLogError}
              </p>
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
          {latestBrief && (
            <p className="mt-3 text-xs text-foreground/50">
              {t("evidenceLatestMeta", {
                from: latestBrief.fromDate,
                to: latestBrief.toDate,
                date: new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date(latestBrief.createdAt)),
              })}
            </p>
          )}
          <Link href="/brief" className="mt-5 inline-block">
            <Button>{latestBrief ? t("viewClinicalBrief") : t("generateFirstBrief")}</Button>
          </Link>
        </section>

        <SafetyNotice />
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
