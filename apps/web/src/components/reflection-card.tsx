"use client";

import { useTranslations } from "next-intl";
import type { ReflectionDto } from "@embr/types";

/**
 * ReflectionDto is deliberately just structured facts (see its doc
 * comment in @embr/types) — this is the one place on web that turns
 * those facts into the exact sentence a user sees, per type. Every
 * message here describes what was logged, never what it means — see
 * apps/api's reflection-engine.ts TREATMENT_CONTEXT doc comment for
 * the specific claim ("your treatment is helping") this must never
 * make. Mirrors apps/mobile/components/reflection-card.tsx's copy
 * selection exactly (same four types, same fields per type) — the
 * i18n key structure differs (next-intl namespaces vs react-i18next's
 * flat keys with _one/_other suffixes) because that's each platform's
 * own existing convention, not a product difference.
 */
function reflectionCopy(
  reflection: ReflectionDto,
  t: (key: string, values?: Record<string, unknown>) => string,
): { heading: string; message: string; caveat?: string } {
  switch (reflection.type) {
    case "LOGGING_ACTIVITY":
      // daysLogged needs its own independent plural form from
      // logCount's — same two-step composed-t() pattern brief.tsx's
      // totalPhrase and the mobile reflection card use, for the same
      // reason: next-intl's ICU plural selection on one t() call keys
      // off exactly one interpolated number, so passing both as bare
      // values would silently apply logCount's plural form to
      // daysLogged too whenever they diverge.
      return {
        heading: t("loggingActivity.heading"),
        message: t("loggingActivity.message", {
          count: reflection.logCount,
          daysPhrase: t("loggingActivity.daysPhrase", { count: reflection.daysLogged }),
        }),
      };
    case "SYMPTOM_FREQUENCY":
      return {
        heading: t("symptomFrequency.heading"),
        message: t("symptomFrequency.message", {
          category: reflection.category,
          count: reflection.count,
        }),
      };
    case "SYMPTOM_CO_OCCURRENCE":
      return {
        heading: t("coOccurrence.heading"),
        message: t("coOccurrence.message", {
          categoryA: reflection.categoryA,
          categoryB: reflection.categoryB,
          count: reflection.days,
        }),
        caveat: t("coOccurrence.caveat"),
      };
    case "TREATMENT_CONTEXT":
      return {
        heading: t("treatmentContext.heading", { name: reflection.treatmentName }),
        message: t("treatmentContext.message", { count: reflection.logCount }),
        caveat: t("treatmentContext.caveat"),
      };
  }
}

export function ReflectionCard({
  reflection,
  onDismiss,
}: {
  reflection: ReflectionDto;
  onDismiss: () => void;
}) {
  const t = useTranslations("Reflections");
  const tEnum = useTranslations("Enums");
  const copy = reflectionCopy(reflection, (key, values) => {
    // Category enum values need the shared Enums namespace's own
    // translation, same as everywhere else on web (e.g. brief page's
    // BriefContent) — substituted in here rather than in
    // reflectionCopy itself so that function stays a plain, testable
    // mapping from DTO to raw t() calls.
    if (values?.category) values = { ...values, category: tEnum(`category.${values.category}`) };
    if (values?.categoryA) {
      values = { ...values, categoryA: tEnum(`category.${values.categoryA}`) };
    }
    if (values?.categoryB) {
      values = { ...values, categoryB: tEnum(`category.${values.categoryB}`) };
    }
    return t(key, values as Record<string, string | number>);
  });

  return (
    <div
      className="rounded border border-navy/10 bg-white p-4"
      role="region"
      aria-label={copy.heading}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-sm text-navy">{copy.heading}</h3>
        <button
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="shrink-0 text-navy/40 hover:text-navy/70"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-sm text-navy/80">{copy.message}</p>
      {copy.caveat && <p className="mt-1 text-xs text-navy/50">{copy.caveat}</p>}
    </div>
  );
}
