"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { TreatmentDto, TreatmentImpactDto, TreatmentStopReason } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { toIsoDate } from "../../lib/date-format";
import { AppNav } from "../../components/app-nav";
import { TreatmentTimeline } from "../../components/treatment-timeline";
import { formatHistoryDate } from "../../lib/symptom-history-format";
import { treatmentDuration } from "../../lib/treatment-span";

const CATEGORIES = ["HRT", "SUPPLEMENT", "MEDICATION", "LIFESTYLE", "OTHER"] as const;
// Her reason, from a fixed list, never a judgement. Optional.
const STOP_REASONS: TreatmentStopReason[] = [
  "SIDE_EFFECTS",
  "LONG_TERM_CONCERN",
  "NO_LONGER_NEEDED",
  "COST",
  "OTHER",
  "PREFER_NOT_TO_SAY",
];

export default function TreatmentsPage() {
  const t = useTranslations("Treatments");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const today = toIsoDate(new Date());
  const [managesOrg, setManagesOrg] = useState(false);

  const [treatments, setTreatments] = useState<TreatmentDto[]>([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(true);
  // The treatment being marked as stopped, with the date and reason she picks.
  const [stopping, setStopping] = useState<{
    id: string;
    endDate: string;
    reason: TreatmentStopReason | "";
    error: boolean;
  } | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // null follows the list: open when there is nothing recorded yet.
  const [formOpen, setFormOpen] = useState<boolean | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("HRT");
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [stopReason, setStopReason] = useState<TreatmentStopReason | "">("");
  const [savingReasonId, setSavingReasonId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedImpactId, setExpandedImpactId] = useState<string | null>(null);
  const [impactState, setImpactState] = useState<
    Record<string, { loading: boolean; error: boolean; data: TreatmentImpactDto | null }>
  >({});

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Same Organization-link reasoning as trends/page.tsx.
  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function loadTreatments() {
    setTreatmentsLoading(true);
    try {
      const page = await api.treatments.list({ pageSize: 50 });
      setTreatments(page.items);
    } finally {
      setTreatmentsLoading(false);
    }
  }

  useEffect(() => {
    // Matches the same documented fetch-on-mount pattern used across
    // this app's other pages (dashboard, trends) — see their own
    // comments on the eslint suppression below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) void loadTreatments();
  }, [user]);

  async function handleSave() {
    setFormError(null);
    if (!name.trim() || !startDate) {
      setFormError(t("fillRequiredFields"));
      return;
    }
    if (!ongoing && !endDate) {
      setFormError(t("pickEndDate"));
      return;
    }
    // The date input's own `min={startDate}` (below) steers the native
    // picker away from this, but it isn't a hard guarantee across every
    // browser and mobile date picker, and it does nothing at all if a
    // value ever gets set programmatically. Catching it here means the
    // request is never sent for the one shape the API is guaranteed to
    // reject (see createTreatmentSchema's endDate>=startDate refinement).
    if (!ongoing && endDate && endDate < startDate) {
      setFormError(t("invalidEndDate"));
      return;
    }

    setSaving(true);
    try {
      await api.treatments.create({
        name: name.trim(),
        category,
        startDate,
        endDate: !ongoing && endDate ? endDate : undefined,
        stopReason: !ongoing && endDate && stopReason ? stopReason : undefined,
        notes: notes.trim() || undefined,
      });
      setName("");
      setCategory("HRT");
      setStartDate(toIsoDate(new Date()));
      setOngoing(true);
      setEndDate("");
      setStopReason("");
      setNotes("");
      setFormOpen(false);
      await loadTreatments();
    } catch (err) {
      // Prefer the specific field-level reason the API validated
      // against (e.g. "endDate cannot be before startDate") over the
      // generic "Request validation failed" wrapper every Zod failure
      // gets normalized to (see error-handler.ts's normalizeError) —
      // the top-level message alone told a real user nothing about
      // what to actually fix.
      setFormError(
        err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : t("genericError"),
      );
    } finally {
      setSaving(false);
    }
  }

  // She picks the day she actually stopped (today by default), so a
  // treatment stopped last week isn't recorded as running until today.
  async function handleStop() {
    if (!stopping) return;
    const tr = treatments.find((x) => x.id === stopping.id);
    if (!stopping.endDate || (tr && stopping.endDate < tr.startDate)) {
      setStopping({ ...stopping, error: true });
      return;
    }
    setEndingId(stopping.id);
    try {
      await api.treatments.update(stopping.id, {
        endDate: stopping.endDate,
        ...(stopping.reason ? { stopReason: stopping.reason } : {}),
      });
      setStopping(null);
      await loadTreatments();
    } catch {
      setStopping({ ...stopping, error: true });
    } finally {
      setEndingId(null);
    }
  }

  async function handleStopReason(id: string, value: TreatmentStopReason | "") {
    setSavingReasonId(id);
    try {
      const updated = await api.treatments.update(id, { stopReason: value || null });
      setTreatments((prev) => prev.map((tr) => (tr.id === id ? updated : tr)));
    } catch {
      await loadTreatments();
    } finally {
      setSavingReasonId(null);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    setTreatments((prev) => prev.filter((tr) => tr.id !== id));
    try {
      await api.treatments.delete(id);
    } catch {
      await loadTreatments();
    } finally {
      setDeletingId(null);
    }
  }

  // Lazy, cached per treatment: fetched only the first time a row is
  // expanded, not for every treatment on page load — this is a
  // secondary detail view, not something every visit needs for every
  // row up front.
  async function toggleImpact(id: string) {
    if (expandedImpactId === id) {
      setExpandedImpactId(null);
      return;
    }
    setExpandedImpactId(id);
    if (impactState[id]) return;

    setImpactState((prev) => ({ ...prev, [id]: { loading: true, error: false, data: null } }));
    try {
      const data = await api.treatments.impact(id);
      setImpactState((prev) => ({ ...prev, [id]: { loading: false, error: false, data } }));
    } catch {
      setImpactState((prev) => ({ ...prev, [id]: { loading: false, error: true, data: null } }));
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const current = treatments.filter((tr) => !tr.endDate);
  const past = treatments
    .filter((tr) => tr.endDate)
    .sort((a, b) => b.endDate!.localeCompare(a.endDate!));
  const showForm = formOpen ?? (!treatmentsLoading && treatments.length === 0);

  function durationText(tr: TreatmentDto): string {
    const { unit, count } = treatmentDuration(tr, today);
    return t(`duration.${unit}`, { count });
  }

  function renderTreatment(tr: TreatmentDto) {
    const isOngoing = !tr.endDate;
    const impact = impactState[tr.id];
    const expanded = expandedImpactId === tr.id;
    const isStopping = stopping?.id === tr.id;
    const confirmingDelete = confirmDeleteId === tr.id;
    return (
      <li key={tr.id} className="py-5 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-medium text-foreground">{tr.name}</p>
          <span className="rounded-sm border border-lilac-300 px-2 py-0.5 text-caption text-foreground/70">
            {tEnum(`treatmentCategory.${tr.category}`)}
          </span>
        </div>
        <p className="mt-1 text-body-s text-foreground/70">
          {isOngoing
            ? t("since", { date: formatHistoryDate(locale, tr.startDate) })
            : t("fromTo", {
                from: formatHistoryDate(locale, tr.startDate),
                to: formatHistoryDate(locale, tr.endDate!),
              })}
          <span className="text-foreground/50">
            {" · "}
            {durationText(tr)}
          </span>
        </p>
        {tr.notes && <p className="mt-1 text-body-s text-foreground/60">{tr.notes}</p>}

        {!isOngoing && (
          <label className="mt-3 flex flex-col gap-1 text-body-s text-foreground/70">
            <span>{t("stopReasonRowLabel", { name: tr.name })}</span>
            <select
              value={tr.stopReason ?? ""}
              onChange={(e) =>
                void handleStopReason(tr.id, e.target.value as TreatmentStopReason | "")
              }
              disabled={savingReasonId === tr.id}
              className="min-h-11 w-full max-w-xs rounded-sm border border-border bg-background px-3 text-foreground disabled:opacity-50"
            >
              <option value="">{t("stopReasonNone")}</option>
              {STOP_REASONS.map((r) => (
                <option key={r} value={r}>
                  {tEnum(`treatmentStopReason.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-body-s">
          <button
            type="button"
            onClick={() => void toggleImpact(tr.id)}
            aria-expanded={expanded}
            className="min-h-11 font-medium text-foreground underline decoration-lilac-500 underline-offset-4"
          >
            {expanded ? t("hideImpact") : t("showImpact")}
          </button>
          {isOngoing && !isStopping && (
            <button
              type="button"
              onClick={() => setStopping({ id: tr.id, endDate: today, reason: "", error: false })}
              className="min-h-11 font-medium text-foreground underline decoration-lilac-500 underline-offset-4"
            >
              {t("markStopped")}
            </button>
          )}
          {!confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(tr.id)}
              disabled={deletingId === tr.id}
              className="min-h-11 text-foreground/70 underline decoration-destructive underline-offset-4 disabled:opacity-50"
            >
              {t("delete")}
            </button>
          )}
        </div>

        {confirmingDelete && (
          <div
            role="group"
            aria-label={t("deleteConfirm", { name: tr.name })}
            className="mt-2 rounded-md border border-border-subtle bg-background p-4 text-body-s"
          >
            <p className="text-foreground">{t("deleteConfirm", { name: tr.name })}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => void handleDelete(tr.id)}>{t("deleteConfirmAction")}</Button>
              <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}

        {isStopping && stopping && (
          <div
            role="group"
            aria-label={t("markStoppedHeading", { name: tr.name })}
            className="mt-2 flex flex-col gap-4 rounded-md border border-border-subtle bg-background p-4"
          >
            <p className="text-body-s font-medium text-foreground">
              {t("markStoppedHeading", { name: tr.name })}
            </p>
            <Field
              label={t("stoppedOn")}
              type="date"
              value={stopping.endDate}
              min={tr.startDate}
              max={today}
              onChange={(e) => setStopping({ ...stopping, endDate: e.target.value, error: false })}
            />
            <label className="flex max-w-xs flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("stopReasonLabel")}</span>
              <select
                value={stopping.reason}
                onChange={(e) =>
                  setStopping({ ...stopping, reason: e.target.value as TreatmentStopReason | "" })
                }
                className="min-h-11 rounded-sm border border-border bg-background px-3 text-foreground"
              >
                <option value="">{t("stopReasonNone")}</option>
                {STOP_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {tEnum(`treatmentStopReason.${r}`)}
                  </option>
                ))}
              </select>
              <span className="text-foreground/70">{t("stopReasonHelp")}</span>
            </label>
            {stopping.error && (
              <p role="alert" className="text-sm font-medium text-foreground">
                {t("stopError")}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleStop()} disabled={endingId === tr.id}>
                {endingId === tr.id ? t("saving") : t("saveStopped")}
              </Button>
              <Button variant="ghost" onClick={() => setStopping(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-3 rounded-md border border-border-subtle bg-background p-4 text-body-s">
            {!impact || impact.loading ? (
              <p className="text-foreground/50">{tCommon("loading")}</p>
            ) : impact.error ? (
              <p className="font-medium text-foreground">{t("impactError")}</p>
            ) : impact.data!.insufficientData ? (
              <p className="text-foreground/60">{t("impactInsufficientData")}</p>
            ) : (
              <dl className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-foreground/70">{t("impactBeforeLabel")}</dt>
                  <dd className="text-right font-medium text-foreground">
                    {t("impactCount", {
                      count: impact.data!.before.logCount,
                      days: impact.data!.before.days,
                    })}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-foreground/70">{t("impactAfterLabel")}</dt>
                  <dd className="text-right font-medium text-foreground">
                    {t("impactCount", {
                      count: impact.data!.after.logCount,
                      days: impact.data!.after.days,
                    })}
                  </dd>
                </div>
                <p className="mt-1 text-caption text-foreground/60">{t("impactDisclaimer")}</p>
              </dl>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-body-s text-foreground/60">{t("hint")}</p>

        {treatmentsLoading ? (
          <p className="mt-8 text-body-s text-foreground/50">{tCommon("loading")}</p>
        ) : treatments.length === 0 ? (
          <p className="mt-8 max-w-prose text-body-s text-foreground/70">{t("noneYet")}</p>
        ) : (
          <>
            <TreatmentTimeline treatments={treatments} today={today} />

            {current.length > 0 && (
              <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6">
                <h2 className="font-display text-heading-m text-foreground">
                  {t("currentHeading")}
                </h2>
                <ul className="mt-4 divide-y divide-border-subtle">
                  {current.map(renderTreatment)}
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6">
                <h2 className="font-display text-heading-m text-foreground">{t("pastHeading")}</h2>
                <ul className="mt-4 divide-y divide-border-subtle">{past.map(renderTreatment)}</ul>
              </section>
            )}
          </>
        )}

        <section className="mt-8">
          {!showForm ? (
            <Button variant="ghost" onClick={() => setFormOpen(true)}>
              {t("addTreatmentOpen")}
            </Button>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6">
              <h2 className="font-display text-heading-m text-foreground">{t("addHeading")}</h2>
              <Field
                label={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">{t("category")}</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                  className="min-h-11 rounded-sm border border-border bg-background px-3 text-foreground"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {tEnum(`treatmentCategory.${c}`)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-end gap-4">
                <Field
                  label={t("startDate")}
                  type="date"
                  value={startDate}
                  max={today}
                  onChange={(e) => setStartDate(e.target.value)}
                />

                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={ongoing}
                    onChange={(e) => {
                      setOngoing(e.target.checked);
                      if (e.target.checked) {
                        setEndDate("");
                        setStopReason("");
                      }
                    }}
                  />
                  {t("ongoing")}
                </label>

                {!ongoing && (
                  <Field
                    label={t("endDate")}
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={today}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                )}
              </div>

              {!ongoing && (
                <div className="flex max-w-xs flex-col gap-1.5 text-sm">
                  <label htmlFor="stop-reason" className="font-medium text-foreground">
                    {t("stopReasonLabel")}
                  </label>
                  <select
                    id="stop-reason"
                    value={stopReason}
                    onChange={(e) => setStopReason(e.target.value as TreatmentStopReason | "")}
                    aria-describedby="stop-reason-help"
                    className="min-h-11 rounded-sm border border-border bg-background px-3 text-foreground"
                  >
                    <option value="">{t("stopReasonNone")}</option>
                    {STOP_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {tEnum(`treatmentStopReason.${r}`)}
                      </option>
                    ))}
                  </select>
                  <span id="stop-reason-help" className="text-foreground/70">
                    {t("stopReasonHelp")}
                  </span>
                </div>
              )}

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">{t("notesPlaceholder")}</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
                />
              </label>

              {formError && (
                <p role="alert" className="text-sm font-medium text-foreground">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? t("saving") : t("addTreatment")}
                </Button>
                {treatments.length > 0 && (
                  <Button variant="ghost" onClick={() => setFormOpen(false)}>
                    {t("cancel")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
