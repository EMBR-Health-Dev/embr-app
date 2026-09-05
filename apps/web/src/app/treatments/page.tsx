"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TreatmentDto, TreatmentImpactDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { toIsoDate } from "../../lib/date-format";

const CATEGORIES = ["HRT", "SUPPLEMENT", "MEDICATION", "LIFESTYLE", "OTHER"] as const;

/** Pure presentation-layer merge, not business logic — the impact
 * endpoint already returns two independently-sorted, deterministic
 * arrays (see treatment-impact.ts's summarizeCategoryCounts); this
 * only zips them into rows for a side-by-side before/after list,
 * ordered by combined count descending, then alphabetically. Missing
 * on one side means 0, not absent from the row — a category that
 * dropped to zero after a treatment is exactly the row worth seeing. */
function mergedCategoryCounts(
  before: TreatmentImpactDto["before"]["categoryCounts"],
  after: TreatmentImpactDto["after"]["categoryCounts"],
): Array<{ category: string; before: number; after: number }> {
  const categories = new Set([...before.map((c) => c.category), ...after.map((c) => c.category)]);
  return [...categories]
    .map((category) => ({
      category,
      before: before.find((c) => c.category === category)?.count ?? 0,
      after: after.find((c) => c.category === category)?.count ?? 0,
    }))
    .sort(
      (a, b) => b.before + b.after - (a.before + a.after) || a.category.localeCompare(b.category),
    );
}

export default function TreatmentsPage() {
  const t = useTranslations("Treatments");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [treatments, setTreatments] = useState<TreatmentDto[]>([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("HRT");
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState("");
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

    setSaving(true);
    try {
      await api.treatments.create({
        name: name.trim(),
        category,
        startDate,
        endDate: !ongoing && endDate ? endDate : undefined,
        notes: notes.trim() || undefined,
      });
      setName("");
      setCategory("HRT");
      setStartDate(toIsoDate(new Date()));
      setOngoing(true);
      setEndDate("");
      setNotes("");
      await loadTreatments();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleEndToday(id: string) {
    setEndingId(id);
    try {
      await api.treatments.update(id, { endDate: toIsoDate(new Date()) });
      await loadTreatments();
    } finally {
      setEndingId(null);
    }
  }

  async function handleDelete(id: string) {
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
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      <p className="mt-2 text-sm text-navy/60">{t("hint")}</p>

      <section className="mt-6 flex flex-col gap-4 rounded border border-navy/10 p-5">
        <Field
          label={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">{t("category")}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
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
            max={toIsoDate(new Date())}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(e) => {
                setOngoing(e.target.checked);
                if (e.target.checked) setEndDate("");
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
              max={toIsoDate(new Date())}
              onChange={(e) => setEndDate(e.target.value)}
            />
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">{t("notesPlaceholder")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
          />
        </label>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <Button onClick={handleSave} disabled={saving} className="self-start">
          {saving ? t("saving") : t("addTreatment")}
        </Button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">{t("currentAndPast")}</h2>
        {treatmentsLoading ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : treatments.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">{t("noneYet")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/10">
            {treatments.map((tr) => {
              const isOngoing = !tr.endDate;
              const impact = impactState[tr.id];
              const expanded = expandedImpactId === tr.id;
              return (
                <li key={tr.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-navy">{tr.name}</p>
                      <p className="text-navy/50">
                        {tEnum(`treatmentCategory.${tr.category}`)} · {tr.startDate} –{" "}
                        {isOngoing ? t("ongoing") : tr.endDate}
                      </p>
                      {tr.notes && <p className="mt-1 text-navy/60">{tr.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => void toggleImpact(tr.id)}
                        className="text-teal underline underline-offset-2"
                      >
                        {expanded ? t("hideImpact") : t("showImpact")}
                      </button>
                      {isOngoing && (
                        <button
                          onClick={() => handleEndToday(tr.id)}
                          disabled={endingId === tr.id}
                          className="text-teal underline underline-offset-2 disabled:opacity-50"
                        >
                          {endingId === tr.id ? "…" : t("endToday")}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(tr.id)}
                        disabled={deletingId === tr.id}
                        className="text-red-600 underline underline-offset-2 disabled:opacity-50"
                      >
                        {deletingId === tr.id ? "…" : t("delete")}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 rounded border border-teal/20 bg-teal/5 p-3 text-sm">
                      {!impact || impact.loading ? (
                        <p className="text-navy/50">{tCommon("loading")}</p>
                      ) : impact.error ? (
                        <p className="text-red-600">{t("impactError")}</p>
                      ) : impact.data!.insufficientData ? (
                        <p className="text-navy/60">{t("impactInsufficientData")}</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-navy/70">{t("impactBeforeLabel")}</span>
                            <span className="font-medium text-navy">
                              {impact.data!.before.logCount} ·{" "}
                              {t("impactWindow", { count: impact.data!.before.days })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-navy/70">{t("impactAfterLabel")}</span>
                            <span className="font-medium text-navy">
                              {impact.data!.after.logCount} ·{" "}
                              {t("impactWindow", { count: impact.data!.after.days })}
                            </span>
                          </div>

                          <div className="mt-2 border-t border-teal/20 pt-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-navy/50">
                              {t("impactSeverityHeader")}
                            </p>
                            <div className="mt-1 flex flex-col gap-1">
                              {impact.data!.before.severityCounts.map((beforeEntry, i) => {
                                const afterEntry = impact.data!.after.severityCounts[i]!;
                                return (
                                  <div
                                    key={beforeEntry.severity}
                                    className="flex items-center justify-between"
                                  >
                                    <span className="text-navy/70">
                                      {tEnum(`severity.${beforeEntry.severity}`)}
                                    </span>
                                    <span className="font-medium text-navy">
                                      {beforeEntry.count} → {afterEntry.count}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {(impact.data!.before.categoryCounts.length > 0 ||
                            impact.data!.after.categoryCounts.length > 0) && (
                            <div className="mt-2 border-t border-teal/20 pt-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-navy/50">
                                {t("impactCategoryHeader")}
                              </p>
                              <div className="mt-1 flex flex-col gap-1">
                                {mergedCategoryCounts(
                                  impact.data!.before.categoryCounts,
                                  impact.data!.after.categoryCounts,
                                ).map(({ category, before, after }) => (
                                  <div key={category} className="flex items-center justify-between">
                                    <span className="text-navy/70">
                                      {tEnum(`category.${category}`)}
                                    </span>
                                    <span className="font-medium text-navy">
                                      {before} → {after}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <p className="mt-1 text-xs text-navy/50">{t("impactDisclaimer")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
