"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { OnboardingProfileDto, SymptomLogDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { startingPointMessage } from "../../lib/onboarding-starting-point";

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

function isCategory(value: string | null): value is (typeof CATEGORIES)[number] {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function DashboardContent() {
  const t = useTranslations("Dashboard");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, logout } = useAuth();

  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [managesOrg, setManagesOrg] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfileDto | null>(null);

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

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const page = await api.symptomLogs.list({ pageSize: 10 });
      setLogs(page.items);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    // Matches React's own documented fetch-on-mount pattern — see the
    // equivalent suppression in apps/admin/dashboard/page.tsx for the
    // full reasoning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) void loadLogs();
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

  async function logHotFlashNow() {
    try {
      await api.symptomLogs.create({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date().toISOString(),
      });
      setConfirmation(t("hotFlashConfirmation"));
      await loadLogs();
    } catch (err) {
      setConfirmation(err instanceof ApiError ? err.message : t("hotFlashError"));
    }
  }

  async function handleLogSubmit() {
    setSubmitting(true);
    try {
      await api.symptomLogs.create({
        category,
        severity,
        occurredAt: new Date().toISOString(),
        notes: notes.trim() || undefined,
      });
      setNotes("");
      setFormOpen(false);
      await loadLogs();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCycleEntry() {
    setCycleSaving(true);
    try {
      await api.cycleEntries.upsert({
        date: todayIso(),
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
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">EMBR</h1>
        <div className="flex items-center gap-4 text-sm text-navy/60">
          <Link href="/trends" className="underline underline-offset-2 hover:text-navy">
            {t("trends")}
          </Link>
          <Link href="/brief" className="underline underline-offset-2 hover:text-navy">
            {t("brief")}
          </Link>
          <Link href="/export" className="underline underline-offset-2 hover:text-navy">
            {t("export")}
          </Link>
          {managesOrg && (
            <Link href="/organization" className="underline underline-offset-2 hover:text-navy">
              {t("organization")}
            </Link>
          )}
          <Link href="/settings" className="underline underline-offset-2 hover:text-navy">
            {t("settings")}
          </Link>
          <span>{user.email}</span>
          <button
            onClick={() => logout().then(() => router.replace("/login"))}
            className="underline underline-offset-2 hover:text-navy"
          >
            {t("logout")}
          </button>
        </div>
      </header>

      {startingPointMessage(onboardingProfile?.jobToBeDone ?? null) && (
        <p className="mt-6 font-display text-lg italic text-navy/80">
          {startingPointMessage(onboardingProfile?.jobToBeDone ?? null)}
        </p>
      )}

      {/* Signature interaction: one tap, no form, for the moment that
          actually needs it — mid-hot-flash is not when anyone wants to
          fill out a category picker. */}
      <section className="mt-10 flex flex-col items-center gap-3 rounded border border-brass/30 bg-brass/5 py-10 text-center">
        <button
          onClick={logHotFlashNow}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-brass text-bone shadow-[0_0_0_6px_rgba(184,151,79,0.15)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy active:scale-95"
          aria-label={t("hotFlashAriaLabel")}
        >
          <span className="text-3xl">◉</span>
        </button>
        <p className="font-display text-lg text-navy">{t("hotFlashPrompt")}</p>
        <p className="text-sm text-navy/60">{t("hotFlashHint")}</p>
        {confirmation && <p className="text-sm font-medium text-teal">{confirmation}</p>}
      </section>

      {/* Everything else — a real form, but tucked away until asked for. */}
      <section className="mt-6">
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {formOpen ? t("close") : t("logDifferentSymptom")}
        </button>

        {formOpen && (
          <div className="mt-4 flex flex-col gap-4 rounded border border-navy/10 p-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">{t("symptomLabel")}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {tEnum(`category.${c}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">{t("severityLabel")}</span>
              <div className="flex gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`flex-1 rounded-sm border px-3 py-2 text-sm ${
                      severity === s ? "border-navy bg-navy text-bone" : "border-navy/20 text-navy"
                    }`}
                  >
                    {tEnum(`severity.${s}`)}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">{t("notesLabel")}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
              />
            </label>

            <Button onClick={handleLogSubmit} disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </Button>
          </div>
        )}
      </section>

      {/* Cycle quick-log for today. */}
      <section className="mt-8 rounded border border-teal/20 bg-teal/5 p-5">
        <h2 className="font-display text-lg text-navy">{t("todaysCycleEntry")}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">{t("flowLabel")}</span>
            <select
              value={flow}
              onChange={(e) => {
                setFlow(e.target.value as (typeof FLOWS)[number] | "");
                setCycleSaved(false);
              }}
              className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
            >
              <option value="">{t("flowNone")}</option>
              {FLOWS.map((f) => (
                <option key={f} value={f}>
                  {tEnum(`flow.${f}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-navy">
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

          <label className="flex items-center gap-2 text-sm text-navy">
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
        <Button variant="ghost" onClick={saveCycleEntry} disabled={cycleSaving} className="mt-4">
          {cycleSaving ? t("saving") : cycleSaved ? t("saved") : t("saveTodaysEntry")}
        </Button>
      </section>

      {/* Recent history. */}
      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">{t("recentSymptoms")}</h2>
        {logsLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">{t("noLogsYet")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/10">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="font-medium text-navy">{tEnum(`category.${log.category}`)}</span>
                  <span className="ml-2 text-navy/50">{tEnum(`severity.${log.severity}`)}</span>
                  {log.notes && <p className="mt-1 text-navy/60">{log.notes}</p>}
                </div>
                <time className="text-navy/40" dateTime={log.occurredAt}>
                  {new Date(log.occurredAt).toLocaleString(undefined, {
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
      </section>
    </main>
  );
}

export default function DashboardPage() {
  const t = useTranslations("Common");
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-navy/50">{t("loading")}</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
