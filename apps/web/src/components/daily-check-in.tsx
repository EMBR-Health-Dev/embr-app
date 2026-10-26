"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SeverityLevel, SymptomCategory, SymptomCheckInEntryDto } from "@embr/types";
import { symptomCategorySchema } from "@embr/validation";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { toIsoDate } from "../lib/date-format";
import { browserTimeZone } from "../lib/symptom-evidence";
import { Button } from "./button";
import { SeverityMark } from "./severity-mark";
import { richText } from "../lib/rich-text";

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
// The API accepts today and yesterday (CHECK_IN_EDITABLE_DAYS), so a
// late night or a travel day can still be filled in the next day
// instead of staying a gap in the record.
const DAYS = ["today", "yesterday"] as const;
type Day = (typeof DAYS)[number];

function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toIsoDate(d);
}

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
  const [today] = useState(() => toIsoDate(new Date()));
  const [day, setDay] = useState<Day>("today");
  const date = day === "today" ? today : dayBefore(today);
  // Copy that names the day ("today's check in") has a Yesterday twin.
  const tDay = (key: string) => (day === "today" ? key : `${key}Yesterday`);
  const [saved, setSaved] = useState<SymptomCheckInEntryDto[] | null>(null);
  const [recent, setRecent] = useState<SymptomCategory[]>([]);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<Selection>([]);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReactNode>(null);

  useEffect(() => {
    // Switching days quickly must not let the other day's answer land here.
    let cancelled = false;
    api.symptomLogs
      .getCheckIn(date)
      .then((checkIn) => {
        if (cancelled) return;
        setSaved(checkIn.entries);
        setEditing(checkIn.entries.length === 0);
      })
      .catch(() => {
        if (cancelled) return;
        setSaved([]);
        setEditing(true);
        setError(t(day === "today" ? "loadError" : "loadErrorYesterday"));
      });
    return () => {
      cancelled = true;
    };
  }, [date, day, t]);

  useEffect(() => {
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
  }, []);

  function switchDay(next: Day) {
    setDay(next);
    setSaved(null);
    setSelection([]);
    setShowAll(false);
    setStatus(null);
    setError(null);
  }

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
      setStatus(
        result.entries.length > 0 ? t.rich(tDay("saved"), richText) : t(tDay("savedEmpty")),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  const daySwitch = (
    <fieldset className="mb-4">
      <legend className="sr-only">{t("dayLabel")}</legend>
      <div className="inline-flex rounded-sm border border-border p-0.5">
        {DAYS.map((d) => (
          <label key={d} className="cursor-pointer">
            <input
              type="radio"
              name="check-in-day"
              className="peer sr-only"
              checked={day === d}
              disabled={saving}
              onChange={() => switchDay(d)}
            />
            <span className="inline-flex min-h-9 items-center rounded-sm px-3 text-sm text-foreground/70 transition-colors peer-checked:bg-lilac-100 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
              {t(d === "today" ? "dayToday" : "dayYesterday")}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  if (saved === null) {
    // Keep the switch on screen while the other day loads, so the card doesn't jump.
    return day === "today" ? null : (
      <div className="mt-6 rounded border border-border-subtle p-5">{daySwitch}</div>
    );
  }

  if (!editing) {
    return (
      <div className="mt-6 rounded border border-border-subtle p-5">
        {daySwitch}
        <h2 className="font-display text-heading-m text-foreground">{t(tDay("todayHeading"))}</h2>
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
          {t(tDay("edit"))}
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
      {daySwitch}
      <h2 className="font-display text-heading-m text-foreground">{t(tDay("title"))}</h2>
      <p className="mt-1 text-sm text-foreground/60">{t.rich(tDay("intro"), richText)}</p>

      <fieldset className="mt-4">
        <legend className="sr-only">{t(tDay("symptomsLabel"))}</legend>
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
          <p className="text-xs text-foreground/60">{t.rich("severityGuide", richText)}</p>
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
                      <span className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-sm border border-border px-1 py-1.5 text-sm sm:flex-row sm:gap-2 sm:px-3 text-foreground/80 transition-colors peer-checked:border-lilac-700 peer-checked:bg-lilac-100 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
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
          {saving ? t("saving") : t(tDay("save"))}
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
