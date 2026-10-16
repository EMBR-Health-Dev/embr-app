"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";
import { toIsoDate } from "../lib/date-format";

/**
 * Her last period, as she reports it: for when it came before she used
 * EMBR or she has stopped logging periods. A best guess is fine. Shown
 * in her BRIEF beside the last period day she logged, whichever is
 * later; never inferred and never sent to the AI.
 */
export function LastPeriodControl() {
  const t = useTranslations("Settings");
  const inputId = useId();
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "removed" | "error" | null>(null);

  useEffect(() => {
    api.onboarding
      .get()
      .then((profile) => {
        setSaved(profile.lastPeriodDate);
        setValue(profile.lastPeriodDate ?? "");
      })
      .catch(() => setSaved(null));
  }, []);

  async function save(next: string | null) {
    setSaving(true);
    setStatus(null);
    try {
      const profile = await api.onboarding.patch({ lastPeriodDate: next });
      setSaved(profile.lastPeriodDate);
      setValue(profile.lastPeriodDate ?? "");
      setStatus(next === null ? "removed" : "saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value && value !== saved) void save(value);
  }

  if (saved === undefined) return null;

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2" noValidate>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {t("lastPeriodLabel")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="date"
          value={value}
          max={toIsoDate(new Date())}
          min="1950-01-01"
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 rounded-sm border border-border bg-background px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
        <button
          type="submit"
          disabled={saving || !value || value === saved}
          className="min-h-11 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? t("lastPeriodSaving") : t("lastPeriodSave")}
        </button>
        {saved && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(null)}
            className="text-sm text-graphite-700 underline underline-offset-2 disabled:opacity-60"
          >
            {t("lastPeriodRemove")}
          </button>
        )}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-foreground/70">
        {status === "saved" && t("lastPeriodSaved")}
        {status === "removed" && t("lastPeriodRemoved")}
        {status === "error" && t("lastPeriodError")}
      </p>
    </form>
  );
}
