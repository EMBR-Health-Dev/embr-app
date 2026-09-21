"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SymptomCoOccurrenceDto, SymptomFrequencyDto } from "@embr/types";
import { api } from "../lib/api";
import { SectionLabel } from "./section-label";

/**
 * Three explicit, separately labeled layers (see the
 * embr-clinical-logic skill doctrine) so a reported fact, a
 * deterministic pattern, and a suggested question never blur into one
 * undifferentiated "insight":
 *
 * - Observed: raw per-category counts, already fetched by the parent
 *   page (trends/page.tsx) — Stage 2/3 data, not this component's own
 *   computation.
 * - Pattern: the co-occurrence itself — Stage 3's
 *   detectSymptomCoOccurrence output, unchanged from before this pass.
 * - Discuss with your GP: a fixed, parameterized question template,
 *   the same kind of deterministic Stage 4 lookup stage4-interpretation.ts
 *   uses for the Clinical Brief — never AI-generated here, since this
 *   card renders on every Patterns page view, not once per brief.
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
        aria-label={t("heading")}
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

  return (
    <section
      className="mt-8 rounded border border-primary bg-primary/5 p-5"
      role="region"
      aria-label={t("heading")}
    >
      <SectionLabel>{t("cardLabel")}</SectionLabel>
      <p className="mt-2 text-sm text-foreground/60">{t("cardDescription")}</p>
      <h2 className="mt-3 font-display text-heading-m text-foreground">{t("heading")}</h2>

      <div className="mt-5">
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

      <div className="mt-5">
        <SectionLabel as="h3">{t("patternLabel")}</SectionLabel>
        <p className="mt-2 text-sm text-foreground/80">
          {t("message", { categoryA: labelA, categoryB: labelB, days: result.days })}
        </p>
        <p className="mt-2 text-xs text-foreground/50">{t("caveat")}</p>
      </div>

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
