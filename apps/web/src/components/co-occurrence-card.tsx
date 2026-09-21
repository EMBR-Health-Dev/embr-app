"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SymptomCoOccurrenceDto, SymptomFrequencyDto } from "@embr/types";
import { api } from "../lib/api";
import { SectionLabel } from "./section-label";
import { WhyAmISeeingThis } from "./why-am-i-seeing-this";

/**
 * A finding → evidence → interpretation boundary → clinician question
 * structure (see the embr-clinical-logic skill doctrine) so a real,
 * plain-language claim, the literal data behind it, and a suggested
 * question never blur into one undifferentiated "insight":
 *
 * - Finding: a real sentence stating what was observed, not a generic
 *   card title.
 * - Evidence: the literal shared dates, shown directly (not hidden
 *   behind a disclosure) as a small visual timeline — plus the
 *   Observed per-category counts already fetched by the parent page
 *   (trends/page.tsx), Stage 2/3 data, not this component's own
 *   computation.
 * - Interpretation boundary: the caveat that this is a description,
 *   not a diagnosis or a causal claim.
 * - Discuss with your GP: a fixed, parameterized question template,
 *   the same kind of deterministic Stage 4 lookup stage4-interpretation.ts
 *   uses for the Clinical Brief — never AI-generated here, since this
 *   card renders on every Signals page view, not once per brief.
 *
 * "Why am I seeing this?" (WhyAmISeeingThis) adds one more layer below
 * that: not the evidence itself (already visible above), but EMBR's
 * own reasoning for surfacing it at all — the threshold a signal like
 * this has to clear.
 */
export function CoOccurrenceCard({
  from,
  to,
  frequency = [],
  windowDays,
}: {
  from?: string;
  to?: string;
  frequency?: SymptomFrequencyDto[];
  windowDays?: number;
}) {
  const t = useTranslations("CoOccurrence");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();

  const [result, setResult] = useState<SymptomCoOccurrenceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Matches React's own documented data-fetching-in-effect pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data);
    // react-hooks/set-state-in-effect flags it anyway. Same reasoning
    // as the equivalent suppression elsewhere in trends/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrored(false);

    api.trends
      .coOccurrence({ from, to })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        // Fails quietly, not with an error banner — this is a nice-to-
        // have insight, not core functionality; nothing else on the
        // page depends on it. A real failure just means the card
        // doesn't render, the same as the "nothing qualifies" case.
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  if (loading) {
    return (
      <section className="mt-8 rounded border border-border-subtle p-5" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  // A real fetch failure renders nothing — this is a nice-to-have
  // insight, not core functionality, and there's nothing useful to
  // tell someone about a transient network error on a supplementary
  // card. "No pair has qualified yet" (errored === false, result ===
  // null) is a different, expected, common case — see the empty
  // state below, not folded into this silent branch.
  if (errored) return null;

  if (!result) {
    return (
      <section
        className="mt-8 rounded border border-border-subtle p-5"
        role="region"
        aria-label={t("cardLabel")}
      >
        <SectionLabel>{t("cardLabel")}</SectionLabel>
        <p className="mt-2 text-sm text-foreground/60">{t("cardDescription")}</p>
        <p className="mt-3 text-sm font-medium text-foreground">{t("emptyTitle")}</p>
        <p className="mt-1 text-sm text-foreground/60">{t("emptyBody")}</p>
      </section>
    );
  }

  const labelA = tEnum(`category.${result.categoryA}`);
  const labelB = tEnum(`category.${result.categoryB}`);
  const countA = frequency.find((f) => f.category === result.categoryA)?.count ?? 0;
  const countB = frequency.find((f) => f.category === result.categoryB)?.count ?? 0;
  const formattedDates = (result.dates ?? []).map((d) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
      new Date(`${d}T00:00:00`),
    ),
  );

  return (
    <section
      className="mt-8 border-l-2 border-primary py-1 pl-5"
      role="region"
      aria-label={t("cardLabel")}
    >
      <SectionLabel>{t("cardLabel")}</SectionLabel>

      {/* Finding — a real sentence, not a generic "what you've logged
          together" card title. */}
      <h2 className="mt-3 font-display text-heading-m text-foreground">
        {t("findingHeading", { categoryA: labelA, categoryB: labelB })}
      </h2>

      {/* Evidence — always visible, not hidden behind a disclosure. A
          small visual timeline (dot · connector · dot) rather than a
          plain comma-separated date list. */}
      <div className="mt-4">
        <SectionLabel as="h3">{t("evidenceLabel")}</SectionLabel>
        <p className="mt-2 text-sm font-medium text-foreground">
          {t("sharedDaysCount", { days: result.days })}
        </p>
        {formattedDates.length > 0 && (
          <div className="mt-2 flex items-center overflow-x-auto pb-1">
            {formattedDates.map((label, i) => (
              <div key={label} className="flex shrink-0 items-center">
                {i > 0 && <div className="h-px w-4 shrink-0 bg-border sm:w-6" aria-hidden="true" />}
                <div className="flex flex-col items-center gap-1 px-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  <span className="whitespace-nowrap text-xs text-foreground/70">{label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <SectionLabel as="h3">{t("observedLabel")}</SectionLabel>
        <p className="mt-2 text-sm text-foreground/80">
          {t("observedText", {
            categoryA: labelA,
            categoryB: labelB,
            countA,
            countB,
            days: windowDays ?? 0,
          })}
        </p>
      </div>

      {/* Interpretation boundary — always visible, same reasoning as
          the evidence above: this is the one sentence that must never
          be one tap away. */}
      <p className="mt-3 text-xs text-foreground/50">{t("caveat")}</p>

      <WhyAmISeeingThis>
        <p>{t("whyReasoning", { categoryA: labelA, categoryB: labelB, days: result.days })}</p>
      </WhyAmISeeingThis>

      <div className="mt-5 border-t border-border-subtle pt-4">
        <SectionLabel as="h3">{t("questionLabel")}</SectionLabel>
        <p className="mt-2 text-sm text-foreground/80">
          {t("questionText", { categoryA: labelA, categoryB: labelB })}
        </p>
        <p className="mt-2 text-xs text-foreground/50">{t("questionCaveat")}</p>
      </div>
    </section>
  );
}
