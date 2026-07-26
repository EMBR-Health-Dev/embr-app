"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SymptomLogDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";

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

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("BRAIN_FOG");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("MODERATE");
  const [notes, setNotes] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [flow, setFlow] = useState<(typeof FLOWS)[number] | "">("");
  const [periodStart, setPeriodStart] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleSaved, setCycleSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
    if (user) void loadLogs();
  }, [user]);

  async function logHotFlashNow() {
    try {
      await api.symptomLogs.create({
        category: "HOT_FLASH",
        severity: "MODERATE",
        occurredAt: new Date().toISOString(),
      });
      setConfirmation("Logged. Adjust the severity below if it wasn't moderate.");
      await loadLogs();
    } catch (err) {
      setConfirmation(err instanceof ApiError ? err.message : "Couldn't log that — try again.");
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
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">EMBR</h1>
        <div className="flex items-center gap-4 text-sm text-navy/60">
          <Link href="/trends" className="underline underline-offset-2 hover:text-navy">
            Trends
          </Link>
          <span>{user.email}</span>
          <button
            onClick={() => logout().then(() => router.replace("/login"))}
            className="underline underline-offset-2 hover:text-navy"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Signature interaction: one tap, no form, for the moment that
          actually needs it — mid-hot-flash is not when anyone wants to
          fill out a category picker. */}
      <section className="mt-10 flex flex-col items-center gap-3 rounded border border-brass/30 bg-brass/5 py-10 text-center">
        <button
          onClick={logHotFlashNow}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-brass text-bone shadow-[0_0_0_6px_rgba(184,151,79,0.15)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy active:scale-95"
          aria-label="Log a hot flash happening right now"
        >
          <span className="text-3xl">◉</span>
        </button>
        <p className="font-display text-lg text-navy">Having a hot flash right now?</p>
        <p className="text-sm text-navy/60">Tap it. That&apos;s the whole log entry.</p>
        {confirmation && <p className="text-sm font-medium text-teal">{confirmation}</p>}
      </section>

      {/* Everything else — a real form, but tucked away until asked for. */}
      <section className="mt-6">
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {formOpen ? "Close" : "Log a different symptom"}
        </button>

        {formOpen && (
          <div className="mt-4 flex flex-col gap-4 rounded border border-navy/10 p-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">Symptom</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">Severity</span>
              <div className="flex gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`flex-1 rounded-sm border px-3 py-2 text-sm capitalize ${
                      severity === s ? "border-navy bg-navy text-bone" : "border-navy/20 text-navy"
                    }`}
                  >
                    {s.toLowerCase()}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-navy">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
              />
            </label>

            <Button onClick={handleLogSubmit} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </section>

      {/* Cycle quick-log for today. */}
      <section className="mt-8 rounded border border-teal/20 bg-teal/5 p-5">
        <h2 className="font-display text-lg text-navy">Today&apos;s cycle entry</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">Flow</span>
            <select
              value={flow}
              onChange={(e) => {
                setFlow(e.target.value as (typeof FLOWS)[number] | "");
                setCycleSaved(false);
              }}
              className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
            >
              <option value="">None</option>
              {FLOWS.map((f) => (
                <option key={f} value={f}>
                  {categoryLabel(f)}
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
            Period started today
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
            Period ended today
          </label>
        </div>
        <Button variant="ghost" onClick={saveCycleEntry} disabled={cycleSaving} className="mt-4">
          {cycleSaving ? "Saving…" : cycleSaved ? "Saved ✓" : "Save today's entry"}
        </Button>
      </section>

      {/* Recent history. */}
      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">Recent symptoms</h2>
        {logsLoading ? (
          <p className="mt-3 text-sm text-navy/50">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">
            Nothing logged yet — use the button above whenever something happens.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/10">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="font-medium text-navy">{categoryLabel(log.category)}</span>
                  <span className="ml-2 text-navy/50 capitalize">{log.severity.toLowerCase()}</span>
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
