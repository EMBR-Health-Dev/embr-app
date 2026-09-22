"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SymptomContextCoOccurrenceDto } from "@embr/types";
import { api } from "../lib/api";
import { toIsoDate } from "../lib/date-format";
import { SectionLabel } from "./section-label";
import { WhyAmISeeingThis } from "./why-am-i-seeing-this";

/**
 * The context-factor sibling of CoOccurrenceCard — same finding →
 * evidence → interpretation-boundary structure, same "recorded
 * together"/"appeared alongside" evidence language, same visible
 * date timeline instead of a hidden disclosure. See that component's
 * doc comment for the full embr-clinical-logic reasoning; this one
 * differs only in what it's evidence *of* (a symptom category and one
 * of a small, fixed set of daily context factors — sleep, caffeine,
 * alcohol, stress — never a second symptom).
 *
 * Deliberately no "Discuss with your GP" layer here yet: unlike the
 * symptom-symptom finding, a context factor isn't itself a clinical
 * question to raise, and the evidence base for any of these four
 * factors actually affecting hot flashes is explicitly thin (see the
 * HotFlashReferenceLibrary's context_lifestyle section) — adding a
 * fixed clinician-question template here would overstate what this
 * observation supports.
 */
export function ContextCoOccurrenceCard({ from, to }: { from?: string; to?: string }) {
  const t = useTranslations("ContextCoOccurrence");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();

  const [result, setResult] = useState<SymptomContextCoOccurrenceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrored(false);

    api.trends
      .contextCoOccurrence({ from, to })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
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
      <section
        className="mt-8 rounded-lg border border-border-subtle bg-surface p-6"
        aria-busy="true"
      >
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  // No qualifying pair yet is a common, expected case — this
  // supplementary card simply doesn't render, the same reasoning as
  // CoOccurrenceCard's errored branch (nothing else on the page
  // depends on it).
  if (errored || !result) return null;

  const categoryLabel = tEnum(`category.${result.category}`);
  const factorLabel = tEnum(`contextFactor.${result.factor}`);
  const formattedDates = result.dates.map((d) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
      new Date(`${d}T00:00:00`),
    ),
  );
  // Unlike CoOccurrenceCard's briefHref, a context factor isn't itself
  // part of Clinical Brief's data model yet (see this file's own doc
  // comment on why there's no GP-question layer either) — so the CTA
  // copy below stays a neutral "view this period," never a claim that
  // this specific factor will be cited.
  const briefHref = from
    ? `/brief?from=${toIsoDate(new Date(from))}&to=${toIsoDate(new Date())}`
    : "/brief";

  return (
    <section
      className="mt-8 rounded-lg border border-border-subtle bg-surface p-6"
      role="region"
      aria-label={t("cardLabel")}
    >
      <SectionLabel>{t("cardLabel")}</SectionLabel>

      <h2 className="mt-3 font-display text-heading-m text-foreground">
        {t("findingHeading", { category: categoryLabel, factor: factorLabel })}
      </h2>

      <div className="mt-4">
        <SectionLabel as="h3">{t("evidenceLabel")}</SectionLabel>
        <p className="mt-2 text-body-s font-medium text-foreground">
          {t("sharedDaysCount", { days: result.days })}
        </p>
        <div className="mt-2 flex items-center overflow-x-auto pb-1">
          {formattedDates.map((label, i) => (
            <div key={label} className="flex shrink-0 items-center">
              {i > 0 && <div className="h-px w-4 shrink-0 bg-border sm:w-6" aria-hidden="true" />}
              <div className="flex flex-col items-center gap-1 px-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                <span className="whitespace-nowrap text-caption text-foreground/70">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-caption text-foreground/50">{t("caveat")}</p>

      <WhyAmISeeingThis>
        <p>
          {t("whyReasoning", { category: categoryLabel, factor: factorLabel, days: result.days })}
        </p>
      </WhyAmISeeingThis>

      <Link
        href={briefHref}
        className="mt-4 inline-block text-caption font-medium text-primary underline underline-offset-2"
      >
        {t("briefCta")}
      </Link>
    </section>
  );
}
