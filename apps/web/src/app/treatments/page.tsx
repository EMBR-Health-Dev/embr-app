"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TreatmentDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

const CATEGORIES = ["HRT", "SUPPLEMENT", "MEDICATION", "LIFESTYLE", "OTHER"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [startDate, setStartDate] = useState(todayIso());
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      setStartDate(todayIso());
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
      await api.treatments.update(id, { endDate: todayIso() });
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
        <Field label={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />

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
            max={todayIso()}
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
              max={todayIso()}
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
              return (
                <li key={tr.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-navy">{tr.name}</p>
                    <p className="text-navy/50">
                      {tEnum(`treatmentCategory.${tr.category}`)} · {tr.startDate} –{" "}
                      {isOngoing ? t("ongoing") : tr.endDate}
                    </p>
                    {tr.notes && <p className="mt-1 text-navy/60">{tr.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
