"use client";

import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SeverityLevel, SymptomHistoryCategoryDto } from "@embr/types";
import { calendarMonths, dayEvidence } from "../lib/symptom-evidence";
import {
  NO_ENTRY_CELL,
  SEVERITY_FILL,
  formatHistoryDate,
  formatHistoryMonth,
} from "../lib/symptom-history-format";

const SEVERITIES: SeverityLevel[] = ["MILD", "MODERATE", "SEVERE"];
// 1 January 2024 was a Monday: seven days from it give localized weekday initials.
const WEEKDAY_SAMPLE = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

/**
 * One symptom's days, month by month. A logged day is filled by its
 * highest severity; a day without an entry stays blank (outlined, no
 * fill) and is described as "no entry recorded", never as a day
 * without the symptom.
 */
export function SymptomCalendar({
  history,
  symptomName,
  from,
  to,
  selectedDate,
  onSelectDate,
  dayDetail,
}: {
  history: SymptomHistoryCategoryDto | undefined;
  symptomName: string;
  from: string;
  to: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** Shown directly under the month of the selected day, so it opens where it was tapped. */
  dayDetail?: React.ReactNode;
}) {
  const t = useTranslations("SymptomHistory");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const weekdays = WEEKDAY_SAMPLE.map((d) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d),
  );

  return (
    <div>
      <ul
        aria-label={t("legendLabel")}
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground/70"
      >
        <li className="flex items-center gap-1.5">
          <span className={`h-3.5 w-3.5 rounded-sm ${NO_ENTRY_CELL}`} aria-hidden="true" />
          {t("noEntry")}
        </li>
        {SEVERITIES.map((severity) => (
          <li key={severity} className="flex items-center gap-1.5">
            <span
              className={`h-3.5 w-3.5 rounded-sm ${SEVERITY_FILL[severity]}`}
              aria-hidden="true"
            />
            {tEnum(`severity.${severity}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-foreground/50">{t("highestSeverityNote")}</p>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        {calendarMonths(from, to).map(({ month, weeks }) => (
          <Fragment key={month}>
            <section
              aria-label={t("calendarLabel", {
                symptom: symptomName,
                month: formatHistoryMonth(locale, month),
              })}
            >
              <h3 className="text-sm font-medium text-foreground">
                {formatHistoryMonth(locale, month)}
              </h3>
              <div
                className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-foreground/40"
                aria-hidden="true"
              >
                {weekdays.map((day, i) => (
                  <span key={i}>{day}</span>
                ))}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {weeks.map((week, w) => (
                  <div key={w} className="grid grid-cols-7 gap-1">
                    {week.map((cell, i) => {
                      if (!cell) return <span key={i} aria-hidden="true" />;
                      const dayNumber = Number(cell.date.slice(8));
                      const label = formatHistoryDate(locale, cell.date);
                      if (!cell.inRange) {
                        return (
                          <span
                            key={cell.date}
                            className="flex aspect-square items-center justify-center text-xs text-foreground/25"
                            aria-label={t("dayOutOfRange", { date: label })}
                          >
                            {dayNumber}
                          </span>
                        );
                      }
                      const evidence = dayEvidence(history, cell.date);
                      const selected = selectedDate === cell.date;
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          data-state={evidence.state}
                          aria-pressed={selected}
                          aria-label={
                            evidence.state === "logged"
                              ? t("dayLogged", {
                                  date: label,
                                  severity: tEnum(`severity.${evidence.maxSeverity}`),
                                })
                              : t("dayNoEntry", { date: label })
                          }
                          onClick={() => onSelectDate(cell.date)}
                          className={`flex aspect-square items-center justify-center rounded-sm text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                            evidence.state === "logged"
                              ? `${SEVERITY_FILL[evidence.maxSeverity]} ${evidence.maxSeverity === "SEVERE" ? "text-pearl-50" : "text-foreground"}`
                              : `${NO_ENTRY_CELL} text-foreground/40`
                          } ${selected ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                        >
                          {dayNumber}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
            {selectedDate?.startsWith(month) && dayDetail && (
              <div className="sm:col-span-2">{dayDetail}</div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
