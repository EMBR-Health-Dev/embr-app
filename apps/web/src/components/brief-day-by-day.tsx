"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ClinicalBriefDto } from "@embr/types";
import { briefDayGrid } from "../lib/brief-day-grid";

// Striped, not just pale: a day with no entry stays distinct from a day
// with other symptoms in greyscale and on paper.
const NO_ENTRY =
  "[background:repeating-linear-gradient(135deg,rgb(var(--color-graphite-300))_0_1px,transparent_1px_4px)]";

/**
 * The BRIEF's period as a strip of days per symptom, oldest on the
 * left, so a clinician sees when symptoms happened, not only how often.
 * Marks presence only: the BRIEF stores which days each symptom was
 * recorded, not its severity per day.
 */
export function BriefDayByDay({
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
  const grid = briefDayGrid(brief);
  if (!grid || grid.rows.length === 0) return null;

  const total = grid.days.length;
  const short = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const label = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));
  const columns = { gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` };

  function cellClass(day: string, logged: Set<string>) {
    if (logged.has(day)) return "bg-lilac-700";
    if (grid!.recorded.has(day)) return "bg-graphite-100";
    return NO_ENTRY;
  }

  return (
    <div className={sectionClassName}>
      <h3 className={headingClassName}>{t("dayByDayTitle")}</h3>
      <p className="mt-1 text-xs text-foreground/60">{t("dayByDayIntro")}</p>
      <ul
        aria-hidden="true"
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60"
      >
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] bg-lilac-700" />
          {t("dayByDayLegendLogged")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] bg-graphite-100" />
          {t("dayByDayLegendOther")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-[2px] border border-graphite-300 ${NO_ENTRY}`} />
          {t("dayByDayLegendNoEntry")}
        </li>
      </ul>

      <div className="mt-3 flex flex-col gap-1.5">
        {grid.rows.map(({ category, logged }) => (
          <div
            key={category}
            className="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]"
          >
            <span className="truncate text-xs text-foreground/80">
              {tEnum(`category.${category}`)}
            </span>
            <span className="sr-only">
              {t("dayByDayRow", {
                symptom: tEnum(`category.${category}`),
                count: logged.size,
                total,
              })}
            </span>
            <div aria-hidden="true" className="grid h-4 gap-px" style={columns}>
              {grid.days.map((day) => (
                <span key={day} className={`rounded-[1px] ${cellClass(day, logged)}`} />
              ))}
            </div>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[9rem_1fr]"
        >
          <span />
          <div className="flex justify-between text-[11px] text-foreground/50">
            <span>{label(grid.days[0]!)}</span>
            <span>{label(grid.days[total - 1]!)}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-foreground/60">
        {t("dayByDayCoverage", {
          recorded: grid.recorded.size,
          total,
          missing: total - grid.recorded.size,
        })}
      </p>
    </div>
  );
}
