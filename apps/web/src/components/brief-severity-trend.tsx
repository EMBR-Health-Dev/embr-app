"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ClinicalBriefDto, SeverityLevel } from "@embr/types";
import { SEVERITY_FILL } from "../lib/symptom-history-format";

const SEVERITY_NUMBER: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };
// The lilac scale inverts in the dark theme (globals.css), so each fill
// takes the text token that stays readable on it in both themes.
const SEVERITY_TEXT: Record<SeverityLevel, string> = {
  MILD: "text-foreground",
  MODERATE: "text-primary-foreground",
  SEVERE: "text-background",
};

/**
 * Severity over the BRIEF's period, block by block: one row per symptom,
 * each cell the highest severity recorded that week (or 4 week block),
 * shaded and printed as 1, 2 or 3 so it reads without colour. A blank
 * cell means nothing was recorded, never "none". A real table, so a
 * screen reader can read each week's value. Mirrors the PDF.
 */
export function BriefSeverityTrend({
  brief,
  headingClassName,
  sectionClassName,
}: {
  brief: ClinicalBriefDto;
  headingClassName: string;
  sectionClassName: string;
}) {
  const t = useTranslations("Brief");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const trend = brief.severityTrend;
  if (!trend || trend.rows.length === 0) return null;

  const short = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const label = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className={sectionClassName}>
      <h3 className={headingClassName}>
        {trend.blockDays === 7 ? t("severityTrendTitleWeekly") : t("severityTrendTitleBlocks")}
      </h3>
      <p className="mt-1 text-xs text-foreground/60">{t("severityTrendIntro")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                {t("severityTrendSymptom")}
              </th>
              {trend.blocks.map(({ start, end }) => (
                <th
                  key={start}
                  scope="col"
                  className="min-w-7 px-0.5 text-center font-normal text-[11px] text-foreground/50"
                >
                  <span aria-hidden="true">{label(start)}</span>
                  <span className="sr-only">
                    {t("severityTrendBlock", { start: label(start), end: label(end) })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.rows.map(({ category, cells }) => (
              <tr key={category}>
                <th
                  scope="row"
                  className="max-w-36 truncate pr-2 text-left font-normal text-foreground/80"
                >
                  {tEnum(`category.${category}`)}
                </th>
                {cells.map((cell, i) => (
                  <td
                    key={trend.blocks[i]!.start}
                    className={`h-5 rounded-[2px] text-center font-semibold tabular-nums ${
                      cell
                        ? `${SEVERITY_FILL[cell.peak]} ${SEVERITY_TEXT[cell.peak]}`
                        : "border border-foreground/15"
                    }`}
                  >
                    {cell ? (
                      <>
                        <span aria-hidden="true">
                          {SEVERITY_NUMBER[cell.peak]}
                          <span className="ml-0.5 align-baseline text-[9px] font-normal">
                            {cell.daysLogged}
                          </span>
                        </span>
                        <span className="sr-only">
                          {t("severityTrendCell", {
                            severity: tEnum(`severity.${cell.peak}`),
                            count: cell.daysLogged,
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="sr-only">{t("severityTrendNothing")}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
