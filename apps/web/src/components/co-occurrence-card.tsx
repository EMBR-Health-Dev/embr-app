"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SymptomCoOccurrenceDto } from "@embr/types";
import { api } from "../lib/api";

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
      <section className="mt-8 rounded border border-navy/10 p-5" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-navy/10" />
      </section>
    );
  }

  // Errored, or nothing qualified — both render nothing. A person
  // shouldn't see a broken-looking card for what's an optional,
  // supplementary insight; the rest of Trends still works either way.
  if (errored || !result) return null;

  return (
    <section
      className="mt-8 rounded border border-brass/40 bg-brass/5 p-5"
      role="region"
      aria-label={t("heading")}
    >
      <h2 className="font-display text-lg text-navy">{t("heading")}</h2>
      <p className="mt-2 text-[15px] text-navy/80">
        {t("message", {
          categoryA: tEnum(`category.${result.categoryA}`),
          categoryB: tEnum(`category.${result.categoryB}`),
          days: result.days,
        })}
      </p>
      <p className="mt-2 text-xs text-navy/50">{t("caveat")}</p>
    </section>
  );
}
