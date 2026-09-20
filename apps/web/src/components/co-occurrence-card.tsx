"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SymptomCoOccurrenceDto } from "@embr/types";
import { api } from "../lib/api";
import { SectionLabel } from "./section-label";

export function CoOccurrenceCard({ from, to }: { from?: string; to?: string }) {
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
        <SectionLabel>{t("observedPatternLabel")}</SectionLabel>
        <p className="mt-2 text-sm text-foreground/60">{t("observedPatternDescription")}</p>
        <p className="mt-3 text-sm font-medium text-foreground">{t("emptyTitle")}</p>
        <p className="mt-1 text-sm text-foreground/60">{t("emptyBody")}</p>
      </section>
    );
  }

  return (
    <section
      className="mt-8 rounded border border-primary bg-primary/5 p-5"
      role="region"
      aria-label={t("heading")}
    >
      <SectionLabel>{t("observedPatternLabel")}</SectionLabel>
      <p className="mt-2 text-sm text-foreground/60">{t("observedPatternDescription")}</p>
      <h2 className="mt-3 font-display text-heading-m text-foreground">{t("heading")}</h2>
      <p className="mt-2 text-sm text-foreground/80">
        {t("message", {
          categoryA: tEnum(`category.${result.categoryA}`),
          categoryB: tEnum(`category.${result.categoryB}`),
          days: result.days,
        })}
      </p>
      <p className="mt-2 text-xs text-foreground/50">{t("caveat")}</p>
    </section>
  );
}
