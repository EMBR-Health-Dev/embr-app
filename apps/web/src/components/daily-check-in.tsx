"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SeverityLevel, SymptomCategory, SymptomCheckInEntryDto } from "@embr/types";
import { symptomCategorySchema } from "@embr/validation";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { toIsoDate } from "../lib/date-format";
import { browserTimeZone } from "../lib/symptom-evidence";
import { Button } from "./button";
import { SeverityMark } from "./severity-mark";

const SEVERITIES: SeverityLevel[] = ["MILD", "MODERATE", "SEVERE"];
// "Other" needs words to mean anything, so it stays in the single
// symptom form (which has notes) rather than the check in.
const CHECK_IN_CATEGORIES = symptomCategorySchema.options.filter((c) => c !== "OTHER");
// Shown before a person has a history of their own.
const STARTER_CATEGORIES: SymptomCategory[] = [
  "HOT_FLASH",
  "NIGHT_SWEATS",
  "SLEEP_DISTURBANCE",
  "BRAIN_FOG",
  "FATIGUE",
  "MOOD_CHANGE",
];
const FAST_PATH_SIZE = 6;

/** Selected symptoms, in the order picked; null = picked, severity not chosen yet. */
type Selection = Array<{ category: SymptomCategory; severity: SeverityLevel | null }>;

/**
 * Several symptoms, one save. Records exactly what the single symptom
 * form records (a symptom with Mild, Moderate or Severe); a symptom
 * that is not selected is not recorded at all, never as "absent".
 * Saving again for the same day edits that day's check in rather than
 * adding to it (the API upserts per symptom and local date).
 */
export function DailyCheckIn({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("CheckIn");
  const tEnum = useTranslations("Enums");

  // Fixed when the check in is opened: finishing it after midnight
  // still saves it to the day it was started on.
  const [date] = useState(() => toIsoDate(new Date()));
  const [saved, setSaved] = useState<SymptomCheckInEntryDto[] | null>(null);
  const [recent, setRecent] = useState<SymptomCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<Selection>([]);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.symptomLogs
      .getCheckIn(date)
      .then((checkIn) => {
        setSaved(checkIn.entries);
        setEditing(checkIn.entries.length === 0);
      })
      .catch(() => {
        setSaved([]);
        setEditing(true);
        setError(t("loadError"));
      });
    // Recently logged symptoms first: the fast path is what this person tracks.
    api.trends
      .symptomHistory({ timeZone: browserTimeZone() })
      .then((history) =>
        setRecent(
          history.categories
            .filter((c) => c.rangeDaysLogged > 0 && c.category !== "OTHER")
            .map((c) => c.category),
        ),
      )
      .catch(() => setRecent([]));
  }, [date, t]);

  function startEditing() {
    setSelection((saved ?? []).map((e) => ({ category: e.category, severity: e.severity })));
    setStatus(null);
    setError(null);
    setEditing(true);
  }

  function toggle(category: SymptomCategory) {
    setStatus(null);
    setSelection((prev) =>
      prev.some((s) => s.category === category)
        ? prev.filter((s) => s.category !== category)
        : [...prev, { category, severity: null }],
    );
  }

  function choose(category: SymptomCategory, severity: SeverityLevel) {
    setSelection((prev) => prev.map((s) => (s.category === category ? { ...s, severity } : s)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.symptomLogs.saveCheckIn(date, {
        timeZone: browserTimeZone(),
        entries: selection.map((s) => ({ category: s.category, severity: s.severity! })),
      });
      setSaved(result.entries);
      setSelection([]);
      setShowAll(false);
      setEditing(result.entries.length === 0);
      setStatus(result.entries.length > 0 ? t("saved") : t("savedEmpty"));
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (saved === null) return null;

  if (!editing) {
    return (
      <div className="mt-6 rounded border border-border-subtle p-5">
        <h2 className="font-display text-heading-m text-foreground">{t("todayHeading")}</h2>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
          {saved.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium">{tEnum(`category.${entry.category}`)}</span>
              {" · "}
              {tEnum(`severity.${entry.severity}`)}
            </li>
          ))}
        </ul>
        {status && (
          <p role="status" className="mt-3 text-sm text-foreground/70">
            {status}
          </p>
        )}
        <button
          type="button"
          onClick={startEditing}
          className="mt-4 text-sm font-medium text-lilac-700 underline underline-offset-4"
        >
          {t("edit")}
        </button>
      </div>
    );
  }

  const fastPath = [...new Set([...recent, ...STARTER_CATEGORIES])].slice(0, FAST_PATH_SIZE);
  const visible = showAll
    ? CHECK_IN_CATEGORIES
    : CHECK_IN_CATEGORIES.filter(
        (c) => fastPath.includes(c) || selection.some((s) => s.category === c),
      ).sort((a, b) => {
        // Keep the fast path in its own order (most logged first).
        const rank = (c: SymptomCategory) => {
          const i = fastPath.indexOf(c);
          return i === -1 ? FAST_PATH_SIZE : i;
        };
        return rank(a) - rank(b);
      });
  const missingSeverity = selection.some((s) => s.severity === null);
  const canSave = !saving && !missingSeverity && (selection.length > 0 || (saved?.length ?? 0) > 0);

  return (
    <form
      className="mt-6 rounded border border-border-subtle p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void save();
      }}
    >
      <h2 className="font-display text-heading-m text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-foreground/60">{t("intro")}</p>

      <fieldset className="mt-4">
        <legend className="sr-only">{t("symptomsLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {visible.map((category) => {
            const checked = selection.some((s) => s.category === category);
            return (
              <label key={category} className="cursor-pointer">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  onChange={() => toggle(category)}
                />
                <span className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-border px-3.5 text-sm text-foreground transition-colors peer-checked:border-lilac-700 peer-checked:bg-lilac-100 peer-checked:font-medium peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                  {checked && <span aria-hidden="true">✓</span>}
                  {tEnum(`category.${category}`)}
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-medium text-lilac-700 underline underline-offset-4"
        >
          {showAll ? t("showFewer") : t("addAnother")}
        </button>
      </fieldset>

      {selection.length > 0 && (
        <div className="mt-5 flex flex-col gap-4 border-t border-border-subtle pt-5">
          {selection.map(({ category, severity }) => {
            const name = tEnum(`category.${category}`);
            return (
              <fieldset key={category} aria-label={t("severityFor", { symptom: name })}>
                <legend className="text-sm font-medium text-foreground">{name}</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {SEVERITIES.map((level) => (
                    <label key={level} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`severity-${category}`}
                        className="peer sr-only"
                        checked={severity === level}
                        onChange={() => choose(category, level)}
                      />
                      <span className="flex min-h-11 items-center justify-center gap-2 rounded-sm border border-border px-3 text-sm text-foreground/80 transition-colors peer-checked:border-lilac-700 peer-checked:bg-lilac-100 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                        <SeverityMark severity={level} />
                        {tEnum(`severity.${level}`)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSave} aria-describedby="check-in-hint">
          {saving ? t("saving") : t("save")}
        </Button>
        {(saved?.length ?? 0) > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setSelection([]);
            }}
          >
            {t("cancel")}
          </Button>
        )}
      </div>
      <p id="check-in-hint" className="mt-2 text-xs text-foreground/60">
        {missingSeverity ? t("severityRequired") : ""}
      </p>
      {status && (
        <p role="status" className="mt-2 text-sm text-foreground/70">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-foreground">
          {error}
        </p>
      )}
    </form>
  );
}
