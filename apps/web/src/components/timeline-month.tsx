"use client";

import { useLocale, useTranslations } from "next-intl";
import { calendarMonths } from "../lib/symptom-evidence";
import { formatHistoryDate, formatHistoryMonth } from "../lib/symptom-history-format";

// 1 January 2024 was a Monday: seven days from it give localized weekday initials.
const WEEKDAY_SAMPLE = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

export interface MonthDayMarks {
  symptoms: boolean;
  cycle: boolean;
  treatments: boolean;
}

/** The marks, by shape so they never depend on colour alone. */
function Marks({ marks }: { marks: MonthDayMarks }) {
  return (
    <span className="flex h-2 items-center justify-center gap-0.5" aria-hidden="true">
      {marks.symptoms && <span className="h-1.5 w-1.5 rounded-full bg-lilac-700" />}
      {marks.cycle && <span className="h-1 w-2.5 rounded-full bg-foreground/70" />}
      {marks.treatments && <span className="h-1.5 w-1.5 bg-lilac-500" />}
    </span>
  );
}

/**
 * One month of the record as a calendar. A day with entries carries a
 * mark per kind of entry; a day without entries is plain and is read
 * out as "no entry recorded", never as a day without symptoms. Tapping
 * a day shows that day's entries underneath.
 */
export function TimelineMonth({
  from,
  to,
  month,
  onMonthChange,
  marksFor,
  selectedDate,
  onSelectDate,
  dayDetail,
}: {
  /** YYYY-MM-DD bounds of the loaded range. */
  from: string;
  to: string;
  /** YYYY-MM shown. */
  month: string;
  onMonthChange: (month: string) => void;
  marksFor: (date: string) => MonthDayMarks | null;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  dayDetail: React.ReactNode;
}) {
  const t = useTranslations("Timeline");
  const locale = useLocale();
  const weekdays = WEEKDAY_SAMPLE.map((d) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d),
  );
  // Newest first, as calendarMonths returns them.
  const months = calendarMonths(from, to);
  const index = Math.max(
    0,
    months.findIndex((m) => m.month === month),
  );
  const current = months[index]!;
  const newer = index > 0 ? months[index - 1]!.month : null;
  const older = index < months.length - 1 ? months[index + 1]!.month : null;
  const monthLabel = formatHistoryMonth(locale, current.month);

  function describe(date: string, marks: MonthDayMarks | null): string {
    const label = formatHistoryDate(locale, date);
    if (!marks) return t("monthDayNoEntry", { date: label });
    const parts = [
      marks.symptoms ? t("monthMarkSymptoms") : null,
      marks.cycle ? t("monthMarkCycle") : null,
      marks.treatments ? t("monthMarkTreatments") : null,
    ].filter(Boolean);
    return `${label}: ${parts.join(", ")}`;
  }

  return (
    <section aria-label={monthLabel} className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => older && onMonthChange(older)}
          disabled={!older}
          className="min-h-11 min-w-11 rounded-sm px-2 text-sm font-medium text-foreground disabled:opacity-30"
          aria-label={t("monthPrevious")}
        >
          ‹
        </button>
        <h2 className="font-display text-heading-m text-foreground">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => newer && onMonthChange(newer)}
          disabled={!newer}
          className="min-h-11 min-w-11 rounded-sm px-2 text-sm font-medium text-foreground disabled:opacity-30"
          aria-label={t("monthNext")}
        >
          ›
        </button>
      </div>

      <ul
        aria-label={t("monthLegend")}
        className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70"
      >
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-lilac-700" aria-hidden="true" />
          {t("monthMarkSymptoms")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1 w-2.5 rounded-full bg-foreground/70" aria-hidden="true" />
          {t("monthMarkCycle")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-lilac-500" aria-hidden="true" />
          {t("monthMarkTreatments")}
        </li>
      </ul>

      <div
        className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-foreground/40"
        aria-hidden="true"
      >
        {weekdays.map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {current.weeks.map((week, w) => (
          <div key={w} className="grid grid-cols-7 gap-1">
            {week.map((cell, i) => {
              if (!cell) return <span key={i} aria-hidden="true" />;
              const dayNumber = Number(cell.date.slice(8));
              if (!cell.inRange) {
                return (
                  <span
                    key={cell.date}
                    className="flex aspect-square items-center justify-center text-xs text-foreground/25"
                    aria-hidden="true"
                  >
                    {dayNumber}
                  </span>
                );
              }
              const marks = marksFor(cell.date);
              const selected = selectedDate === cell.date;
              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-pressed={selected}
                  aria-label={describe(cell.date, marks)}
                  onClick={() => onSelectDate(cell.date)}
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-sm text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                    marks ? "bg-lilac-100 text-foreground" : "text-foreground/50"
                  } ${selected ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                >
                  <span>{dayNumber}</span>
                  {marks ? <Marks marks={marks} /> : <span className="h-2" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDate?.startsWith(current.month) && (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {formatHistoryDate(locale, selectedDate)}
          </h3>
          <div className="mt-2">
            {marksFor(selectedDate) ? (
              dayDetail
            ) : (
              <p className="text-sm text-foreground/60">{t("monthNoEntryDetail")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
