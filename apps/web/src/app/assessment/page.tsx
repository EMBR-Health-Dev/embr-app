"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PerimenopauseAssessmentResultDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";

// Same list SymptomCategory enumerates (apps/api/prisma/schema.prisma)
// — duplicated locally rather than shared, matching how
// dashboard/page.tsx's own CATEGORIES constant already does this for
// the same enum.
const SYMPTOM_CATEGORIES = [
  "HOT_FLASH",
  "NIGHT_SWEATS",
  "MOOD_CHANGE",
  "SLEEP_DISTURBANCE",
  "BRAIN_FOG",
  "JOINT_PAIN",
  "FATIGUE",
  "ANXIETY",
  "IRREGULAR_HEARTBEAT",
  "VAGINAL_DRYNESS",
  "LIBIDO_CHANGE",
  "WEIGHT_CHANGE",
  "HEADACHE",
  "OTHER",
] as const;

export default function AssessmentPage() {
  const t = useTranslations("Assessment");
  const tEnum = useTranslations("Enums");
  const router = useRouter();

  const [symptoms, setSymptoms] = useState<Set<string>>(new Set());
  const [hasIrregularPeriods, setHasIrregularPeriods] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PerimenopauseAssessmentResultDto | null>(null);

  function toggleSymptom(category: string) {
    setSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const data = await api.publicAssessment.submit({
        symptoms: Array.from(symptoms),
        hasIrregularPeriods,
      });
      setResult(data);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-3xl text-navy">
            {result.tier === "high" ? t("highTierTitle") : t("lowTierTitle")}
          </h1>
          <p className="mt-4 text-sm text-navy/70">
            {result.tier === "high" ? t("highTierBody") : t("lowTierBody")}
          </p>
          <p className="mt-6 text-xs text-navy/40">{t("disclaimer")}</p>
          <Button className="mt-8 w-full" onClick={() => router.push("/register")}>
            {t("createAccount")}
          </Button>
          <Link
            href="/login"
            className="mt-4 block text-center text-sm font-medium text-teal underline underline-offset-2"
          >
            {t("alreadyHaveAccount")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-navy">{t("title")}</h1>
        <p className="mt-2 text-sm text-navy/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-navy">{t("symptomsLabel")}</legend>
            {SYMPTOM_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={symptoms.has(category)}
                  onChange={() => toggleSymptom(category)}
                />
                {tEnum(`category.${category}`)}
              </label>
            ))}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={hasIrregularPeriods}
              onChange={(e) => setHasIrregularPeriods(e.target.checked)}
            />
            {t("irregularPeriodsLabel")}
          </label>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-navy/40">{t("disclaimer")}</p>
      </div>
    </main>
  );
}
