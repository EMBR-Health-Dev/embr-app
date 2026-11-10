"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BriefMrsSummaryDto, ClinicalBriefDto, Stage4Pattern } from "@embr/types";
import { BriefDayByDay } from "./brief-day-by-day";
import { BriefSeverityTrend } from "./brief-severity-trend";
import { richText } from "../lib/rich-text";
import { SEVERITY_FILL, formatHistoryDate } from "../lib/symptom-history-format";

/*
 * One BRIEF, read only: her own view on the BRIEF page and the view a
 * clinician sees through a share link render exactly the same thing.
 */

const SEVERITY_ORDER = ["MILD", "MODERATE", "SEVERE"] as const;

export const BRIEF_SECTION_HEADING = "font-body text-sm font-semibold text-lilac-700";
export const BRIEF_SECTION = "border-t border-border-subtle pt-4";

function formatSeverityBreakdown(
  severityBreakdown: Record<string, number>,
  tEnum: (key: string) => string,
  locale: string,
): string {
  // Same {severity: count} shape brief.pdf.ts has always rendered — no
  // new data, this just brings the in-app view to parity with what the
  // PDF already shows. Intl.ListFormat (not a hardcoded ", " join)
  // handles locale-appropriate separators — Japanese conventionally
  // uses "、" rather than a Latin comma-space, so a hardcoded English
  // separator would have been a real, if small, localization
  // regression for ja specifically.
  const parts = Object.entries(severityBreakdown).map(
    ([severity, count]) => `${count} ${tEnum(`severity.${severity}`)}`,
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(parts);
}

// Resolves a cited Stage4Pattern back to the raw evidence object it was
// built from — everything here (frequencyComparison, coOccurrence,
// treatmentImpact) is already on ClinicalBriefDto, sent to the client
// today, just not yet linked back to the pattern that cites it. Returns
// null rather than throwing when nothing matches (an old brief whose
// interpretation predates one of these fields, or a pattern type this
// resolver doesn't yet cover) — a citation with no resolvable evidence
// still has its observation/caveat text to show, it just skips the
// numeric detail underneath.
type ResolvedEvidence =
  | {
      kind: "frequency";
      currentCount: number;
      previousCount: number;
      currentDates: string[];
      previousDates: string[];
    }
  | {
      kind: "coOccurrence";
      days: number;
      categoryA: string;
      categoryB: string;
      dates: string[];
    }
  | {
      kind: "treatmentImpact";
      beforeCount: number;
      beforeDays: number;
      afterCount: number;
      afterDays: number;
      beforeDates: Array<{ date: string; category: string }>;
      afterDates: Array<{ date: string; category: string }>;
    };

function resolveEvidence(pattern: Stage4Pattern, brief: ClinicalBriefDto): ResolvedEvidence | null {
  const ref = pattern.evidenceRef;
  if ("category" in ref) {
    const entry = brief.frequencyComparison?.find((e) => e.category === ref.category);
    return entry
      ? {
          kind: "frequency",
          currentCount: entry.currentCount,
          previousCount: entry.previousCount,
          currentDates: entry.currentDates,
          previousDates: entry.previousDates,
        }
      : null;
  }
  if ("categoryA" in ref) {
    const co = brief.coOccurrence;
    return co && co.categoryA === ref.categoryA && co.categoryB === ref.categoryB
      ? {
          kind: "coOccurrence",
          days: co.days,
          categoryA: co.categoryA,
          categoryB: co.categoryB,
          dates: co.dates ?? [],
        }
      : null;
  }
  const entry = brief.treatmentImpact?.find((e) => e.treatmentId === ref.treatmentId);
  return entry && !entry.insufficientData
    ? {
        kind: "treatmentImpact",
        beforeCount: entry.before.logCount,
        beforeDays: entry.before.days,
        afterCount: entry.after.logCount,
        afterDays: entry.after.days,
        beforeDates: entry.beforeDates,
        afterDates: entry.afterDates,
      }
    : null;
}

// Formats the literal dates behind a resolved evidence entry's count —
// the day-level detail a founder/user can point to and ask "show me
// exactly what caused this line." Short month/day (not a full date, and
// never a timestamp — occurredAt's time-of-day carries no meaning here,
// same reasoning timeline/page.tsx's own formatDateHeading already
// documents) joined with the locale's own list conjunction, matching
// formatSeverityBreakdown's existing Intl.ListFormat convention above.
function formatEvidenceDates(dates: string[], locale: string): string {
  const formatted = dates.map((date) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
      new Date(`${date}T00:00:00`),
    ),
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(formatted);
}

function formatTreatmentEvidenceDates(
  entries: Array<{ date: string; category: string }>,
  locale: string,
  tEnum: ReturnType<typeof useTranslations<"Enums">>,
): string {
  const formatted = entries.map(
    (entry) =>
      `${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
        new Date(`${entry.date}T00:00:00`),
      )} (${tEnum(`category.${entry.category}`)})`,
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(formatted);
}

// Reuses the exact same i18n messages the standalone frequency/co-occurrence/
// treatment-impact sections further down this page already render — this is
// the same numbers, just surfaced next to the citation that's grounded in
// them, not a second copy of the wording.
function formatEvidenceLine(
  resolved: ResolvedEvidence,
  t: ReturnType<typeof useTranslations<"Brief">>,
  tEnum: ReturnType<typeof useTranslations<"Enums">>,
): string {
  switch (resolved.kind) {
    case "frequency":
      return t("frequencyComparisonEntry", {
        currentCount: resolved.currentCount,
        previousCount: resolved.previousCount,
      });
    case "coOccurrence":
      return t("coOccurrenceEntry", {
        categoryA: tEnum(`category.${resolved.categoryA}`),
        categoryB: tEnum(`category.${resolved.categoryB}`),
        days: resolved.days,
      });
    case "treatmentImpact":
      return t("treatmentImpactEntry", {
        beforeCount: resolved.beforeCount,
        beforeDays: resolved.beforeDays,
        afterCount: resolved.afterCount,
        afterDays: resolved.afterDays,
      });
  }
}

export function BriefContent({
  brief,
  audience = "owner",
}: {
  brief: ClinicalBriefDto;
  /*
   * "clinician" is the share-link view: the reader cannot delete or
   * recreate the BRIEF, so owner-only instructions are left out.
   */
  audience?: "owner" | "clinician";
}) {
  const t = useTranslations("Brief");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const [expandedPatternIds, setExpandedPatternIds] = useState<Set<string>>(new Set());

  function toggleEvidence(id: string) {
    setExpandedPatternIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-5 text-sm">
      {brief.patientPriorities && brief.patientPriorities.length > 0 && (
        <div className="rounded-sm bg-lilac-100 px-4 py-3">
          <h3 className={BRIEF_SECTION_HEADING}>{t("prioritiesTitle")}</h3>
          <ol className="mt-1">
            {brief.patientPriorities.map((priority, i) => (
              <li key={i} className="flex gap-3 py-1.5 text-foreground">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 font-semibold tabular-nums text-lilac-700"
                >
                  {i + 1}.
                </span>
                <span>{priority}</span>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-foreground/50">{t("prioritiesNote")}</p>
        </div>
      )}

      {brief.aiStatus === "UNAVAILABLE" ? (
        // The optional AI wording failed; the findings below are the
        // deterministic ones. Say so plainly, substitute nothing.
        <div
          data-testid="brief-ai-unavailable"
          className="rounded-sm border border-border-subtle bg-graphite-100/40 p-4"
        >
          <p className="font-semibold text-foreground">{t("aiUnavailableTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
            {t(audience === "clinician" ? "aiUnavailableBodyShared" : "aiUnavailableBody")}
          </p>
        </div>
      ) : (
        <div>
          <p className="leading-relaxed text-foreground/85">{brief.aiNarrative}</p>
          <p className="mt-1 text-xs text-foreground/50">{t.rich("aiAuthorshipNote", richText)}</p>
        </div>
      )}

      {brief.citedPatternIds && brief.citedPatternIds.length > 0 && brief.interpretation && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("groundedInTitle")}</h3>
          <ul className="mt-1 divide-y divide-border-subtle text-foreground/80">
            {brief.citedPatternIds.flatMap((id) => {
              const pattern = brief.interpretation!.patterns.find((entry) => entry.id === id);
              // Should always resolve — citedPatternIds is only ever
              // populated from ids validateStage4Patterns already
              // confirmed exist in this same interpretation (see
              // brief.service.ts). Skips rather than throws if it
              // somehow doesn't, so a single unexpected id can't take
              // down the whole page.
              if (!pattern) return [];
              const expanded = expandedPatternIds.has(id);
              const resolved = resolveEvidence(pattern, brief);
              const detailId = `evidence-detail-${brief.id}-${id}`;
              return (
                <li key={id} className="py-3">
                  {pattern.observation}
                  {pattern.association ? ` ${pattern.association}` : ""}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleEvidence(id)}
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      className="mt-1 text-xs font-medium text-lilac-700 underline underline-offset-2"
                    >
                      {expanded ? t("hideEvidence") : t("viewEvidence")}
                    </button>
                  </div>
                  {expanded && (
                    <div
                      id={detailId}
                      className="mt-2 pl-4 text-xs leading-relaxed text-foreground/70"
                    >
                      {resolved && <p>{formatEvidenceLine(resolved, t, tEnum)}</p>}
                      {resolved?.kind === "frequency" && (
                        <>
                          {resolved.currentDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesCurrentLabel")}:{" "}
                              {formatEvidenceDates(resolved.currentDates, locale)}
                            </p>
                          )}
                          {resolved.previousDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesPreviousLabel")}:{" "}
                              {formatEvidenceDates(resolved.previousDates, locale)}
                            </p>
                          )}
                        </>
                      )}
                      {resolved?.kind === "coOccurrence" && resolved.dates.length > 0 && (
                        <p className="mt-1">
                          {t("evidenceDatesLabel")}: {formatEvidenceDates(resolved.dates, locale)}
                        </p>
                      )}
                      {resolved?.kind === "treatmentImpact" && (
                        <>
                          {resolved.beforeDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesBeforeLabel")}:{" "}
                              {formatTreatmentEvidenceDates(resolved.beforeDates, locale, tEnum)}
                            </p>
                          )}
                          {resolved.afterDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesAfterLabel")}:{" "}
                              {formatTreatmentEvidenceDates(resolved.afterDates, locale, tEnum)}
                            </p>
                          )}
                        </>
                      )}
                      {resolved && (
                        <p className="mt-1 text-foreground/50">
                          {t("evidenceDatesInterpretation")}
                        </p>
                      )}
                      <p className="mt-1">{pattern.caveat}</p>
                      <p className="mt-2 text-foreground/50">
                        {t("evidenceSourceLabel")}: {t("evidenceSourceSelfReported")}
                      </p>
                      <p className="text-foreground/50">
                        {t("evidenceConfidenceLabel")}: {t("evidenceConfidenceDescriptive")}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {brief.aiDiscussionTopics.length > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("questionsForGp")}</h3>
          <ol className="mt-1 divide-y divide-border-subtle">
            {brief.aiDiscussionTopics.map((topic, i) => (
              <li key={i} className="flex gap-3 py-3 text-foreground">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 font-semibold tabular-nums text-lilac-700"
                >
                  {i + 1}.
                </span>
                <span>{topic}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className={BRIEF_SECTION}>
        <h3 className={BRIEF_SECTION_HEADING}>{t("symptomFrequency")}</h3>
        {brief.symptomSummary.length === 0 && (
          <p className="mt-1 text-foreground/70">{t("noSymptomsInRange")}</p>
        )}
        {brief.symptomSummary.length > 0 && (
          <ul
            aria-hidden="true"
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60"
          >
            {SEVERITY_ORDER.map((severity) => (
              <li key={severity} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${SEVERITY_FILL[severity]}`} />
                {tEnum(`severity.${severity}`)}
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-2 flex flex-col gap-2.5 text-foreground/70">
          {brief.symptomSummary.map((entry) => {
            const maxCount = Math.max(...brief.symptomSummary.map((e) => e.count));
            return (
              <li key={entry.category}>
                {tEnum(`category.${entry.category}`)}:{" "}
                {t("occurrenceCount", { count: entry.count })} (
                {formatSeverityBreakdown(entry.severityBreakdown, tEnum, locale)})
                {/* The same counts as the line above, drawn: a bar per
                    symptom split by severity, sized against the most
                    logged symptom. */}
                <div
                  aria-hidden="true"
                  className="mt-1 flex h-2 overflow-hidden rounded-full"
                  style={{ width: `${(entry.count / maxCount) * 100}%` }}
                >
                  {SEVERITY_ORDER.map((severity) => {
                    const n = entry.severityBreakdown[severity] ?? 0;
                    return n > 0 ? (
                      <span
                        key={severity}
                        className={SEVERITY_FILL[severity]}
                        style={{ width: `${(n / entry.count) * 100}%` }}
                      />
                    ) : null;
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <BriefDayByDay
        brief={brief}
        headingClassName={BRIEF_SECTION_HEADING}
        sectionClassName={BRIEF_SECTION}
      />

      <BriefSeverityTrend
        brief={brief}
        headingClassName={BRIEF_SECTION_HEADING}
        sectionClassName={BRIEF_SECTION}
      />

      {brief.frequencyComparison && brief.frequencyComparison.length > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("frequencyComparisonTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.frequencyComparison.map((entry) => (
              <li key={entry.category}>
                {tEnum(`category.${entry.category}`)}:{" "}
                {t("frequencyComparisonEntry", {
                  currentCount: entry.currentCount,
                  previousCount: entry.previousCount,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.persistentSymptoms && brief.persistentSymptoms.length > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("persistentSymptomsTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.persistentSymptoms.map((category) => (
              <li key={category}>
                {t("persistentSymptomsEntry", { category: tEnum(`category.${category}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.nightSweatsRecall && brief.nightSweatsRecall.morningsAnswered > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("nightSweatsRecallTitle")}</h3>
          <p className="mt-1 text-foreground/70">
            {t("nightSweatsAnswered", { count: brief.nightSweatsRecall.morningsAnswered })}
          </p>
          <p className="text-foreground/70">
            {brief.nightSweatsRecall.breakdown
              ? t("nightSweatsBreakdown", {
                  none: brief.nightSweatsRecall.breakdown.NONE,
                  one: brief.nightSweatsRecall.breakdown.ONE,
                  twoToThree: brief.nightSweatsRecall.breakdown.TWO_TO_THREE,
                  fourPlus: brief.nightSweatsRecall.breakdown.FOUR_PLUS,
                })
              : t("nightSweatsFewAnswers")}
          </p>
          <p className="mt-1 text-xs text-foreground/50">{t("nightSweatsSeparate")}</p>
        </div>
      )}

      {brief.workImpact && brief.workImpact.daysAnswered > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("workImpactTitle")}</h3>
          <p className="mt-1 text-foreground/70">
            {t("workImpactAnswered", { count: brief.workImpact.daysAnswered })}
          </p>
          <p className="text-foreground/70">
            {brief.workImpact.breakdown
              ? t("workImpactBreakdown", {
                  none: brief.workImpact.breakdown.NONE,
                  didLess: brief.workImpact.breakdown.DID_LESS,
                  missedTime: brief.workImpact.breakdown.MISSED_TIME,
                })
              : t("workImpactFewAnswers")}
          </p>
          <p className="mt-1 text-xs text-foreground/50">{t("workImpactPrivate")}</p>
        </div>
      )}

      {brief.socialImpact && brief.socialImpact.daysAnswered > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("socialImpactTitle")}</h3>
          {/* The answered, few answers and privacy lines read the same as
              work impact's, so they are shared. */}
          <p className="mt-1 text-foreground/70">
            {t("workImpactAnswered", { count: brief.socialImpact.daysAnswered })}
          </p>
          <p className="text-foreground/70">
            {brief.socialImpact.breakdown
              ? t("socialImpactBreakdown", {
                  none: brief.socialImpact.breakdown.NONE,
                  didLess: brief.socialImpact.breakdown.DID_LESS,
                  missedPlans: brief.socialImpact.breakdown.MISSED_PLANS,
                })
              : t("workImpactFewAnswers")}
          </p>
          <p className="mt-1 text-xs text-foreground/50">{t("workImpactPrivate")}</p>
        </div>
      )}

      {brief.exercise && brief.exercise.daysAnswered > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("exerciseTitle")}</h3>
          <p className="mt-1 text-foreground/70">
            {t("exerciseAnswered", { count: brief.exercise.daysAnswered })}
          </p>
          <p className="text-foreground/70">
            {brief.exercise.breakdown
              ? t("exerciseBreakdown", {
                  none: brief.exercise.breakdown.NONE,
                  light: brief.exercise.breakdown.LIGHT,
                  moderate: brief.exercise.breakdown.MODERATE,
                  vigorous: brief.exercise.breakdown.VIGOROUS,
                })
              : t("exerciseFewAnswers")}
          </p>
          <p className="mt-1 text-xs text-foreground/50">{t("exerciseScale")}</p>
        </div>
      )}

      {brief.mrs && brief.mrs.checkInsInPeriod > 0 && brief.mrs.first && (
        <MrsSection mrs={brief.mrs} />
      )}

      {brief.coOccurrence && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("patternsNoticedTitle")}</h3>
          <p className="mt-1 text-foreground/70">
            {t("coOccurrenceEntry", {
              categoryA: tEnum(`category.${brief.coOccurrence.categoryA}`),
              categoryB: tEnum(`category.${brief.coOccurrence.categoryB}`),
              days: brief.coOccurrence.days,
            })}
          </p>
        </div>
      )}

      <div className={BRIEF_SECTION}>
        <h3 className={BRIEF_SECTION_HEADING}>{t("cycleSummary")}</h3>
        <p className="mt-1 text-foreground/70">
          {brief.cycleSummary.averageCycleLengthDays === null
            ? t("notEnoughCycleData")
            : t("averageCycleLength", {
                days: brief.cycleSummary.averageCycleLengthDays,
                count: brief.cycleSummary.cycleCount,
              })}
        </p>
        {/* Absent on a BRIEF made before this was recorded. */}
        {brief.lastRecordedPeriod && (
          <>
            <p className="mt-1 text-foreground">
              {brief.lastRecordedPeriod.date === null ||
              brief.lastRecordedPeriod.monthsBeforeBriefEnd === null
                ? t("noPeriodDayLogged")
                : t(
                    brief.lastRecordedPeriod.source === "reported"
                      ? "reportedLastPeriod"
                      : "lastPeriodDay",
                    {
                      date: brief.lastRecordedPeriod.date,
                      months: brief.lastRecordedPeriod.monthsBeforeBriefEnd,
                    },
                  )}
            </p>
            <p className="mt-1 text-xs text-foreground/60">
              {t(
                brief.lastRecordedPeriod.source === "reported"
                  ? "reportedLastPeriodNote"
                  : "lastPeriodDayNote",
              )}
            </p>
          </>
        )}
      </div>

      <div className={BRIEF_SECTION}>
        <h3 className={BRIEF_SECTION_HEADING}>{t("treatmentsLoggedDuringPeriod")}</h3>
        {brief.treatmentSummary.length === 0 ? (
          <p className="mt-1 text-foreground/70">{t("noTreatmentsInRange")}</p>
        ) : (
          <ul className="mt-1 text-foreground/70">
            {brief.treatmentSummary.map((entry, i) => (
              <li key={i}>
                {entry.name}: {tEnum(`treatmentCategory.${entry.category}`)}, {entry.startDate} –{" "}
                {entry.endDate ?? t("ongoing")}
                {entry.stopReason && (
                  <span className="block text-foreground/60">
                    {t("stopReasonEntry", {
                      reason: tEnum(`treatmentStopReason.${entry.stopReason}`),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-foreground/50">{t("treatmentSafetyNote")}</p>
      </div>

      {brief.treatmentImpact && brief.treatmentImpact.length > 0 && (
        <div className={BRIEF_SECTION}>
          <h3 className={BRIEF_SECTION_HEADING}>{t("treatmentImpactTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.treatmentImpact.map((entry) => (
              <li key={entry.treatmentId}>
                {entry.name}:{" "}
                {entry.insufficientData
                  ? t("treatmentImpactInsufficientData")
                  : t("treatmentImpactEntry", {
                      beforeCount: entry.before.logCount,
                      beforeDays: entry.before.days,
                      afterCount: entry.after.logCount,
                      afterDays: entry.after.days,
                    })}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-foreground/50">{t("treatmentSafetyNote")}</p>
        </div>
      )}
    </div>
  );
}

const MRS_KEYS = [
  ["total", "mrsTotal", 44],
  ["somatic", "mrsSomatic", 16],
  ["psychological", "mrsPsychological", 16],
  ["urogenital", "mrsUrogenital", 12],
] as const;

/** Her monthly MRS ratings in the period: the first and latest, each
 * score with its published reference band in brackets, for the
 * clinician. Her own monthly rating page shows only the numbers. */
function MrsSection({ mrs }: { mrs: BriefMrsSummaryDto }) {
  const t = useTranslations("Brief");
  const locale = useLocale();
  const points = mrs.latest ? [mrs.first!, mrs.latest] : [mrs.first!];
  return (
    <div className={BRIEF_SECTION}>
      <h3 className={BRIEF_SECTION_HEADING}>{t("mrsTitle")}</h3>
      <p className="mt-1 text-foreground/70">{t("mrsCount", { count: mrs.checkInsInPeriod })}</p>
      {points.map((point) => (
        <div key={point.completedOn} className="mt-2">
          <p className="text-sm font-medium text-foreground">
            {formatHistoryDate(locale, point.completedOn)}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {MRS_KEYS.map(([key, label, max]) => (
              <div key={key}>
                <dt className="text-foreground/60">{t(label)}</dt>
                <dd className="text-foreground">
                  <span className="font-mono tabular-nums">
                    {t("mrsScore", { score: point.scores[key], max })}
                  </span>{" "}
                  <span className="text-foreground/60">({t(`mrsBand.${point.bands[key]}`)})</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="mt-2 text-xs text-foreground/50">{t("mrsScale")}</p>
      <p className="text-xs text-foreground/50">{t("mrsBands")}</p>
      <p className="text-xs text-foreground/50">{t("mrsCopyright")}</p>
    </div>
  );
}
