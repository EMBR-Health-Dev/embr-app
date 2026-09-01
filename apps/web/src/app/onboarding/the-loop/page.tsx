"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { Button } from "../../../components/button";
import { ONBOARDING_AREA_LABELS, firstSuggestedCategory } from "../../../lib/onboarding-areas";

const AREA_KEYS: Record<string, string> = {
  SLEEP: "Onboarding.whatsGoingOn.sleep",
  ENERGY: "Onboarding.whatsGoingOn.energy",
  MOOD: "Onboarding.whatsGoingOn.mood",
  BODY: "Onboarding.whatsGoingOn.body",
  FOCUS: "Onboarding.whatsGoingOn.focus",
};

export default function TheLoopScreen() {
  const t = useTranslations("Onboarding.theLoop");
  // Untyped namespace lookup for area labels — these live under the
  // whatsGoingOn screen's keys since they're the exact same concept
  // (SLEEP/ENERGY/MOOD/BODY/FOCUS), not duplicated under theLoop too.
  const tRaw = useTranslations();
  const router = useRouter();
  const { profile, patch } = useOnboarding();
  const [finishing, setFinishing] = useState(false);

  const noticedAreas = profile?.noticedAreas ?? [];
  const trackLabel =
    noticedAreas.length > 0
      ? noticedAreas
          .map((a) => (AREA_KEYS[a] ? tRaw(AREA_KEYS[a]) : (ONBOARDING_AREA_LABELS[a] ?? a)))
          .join(" · ")
      : t("trackFallback");

  async function finishAndGo(destination: string) {
    setFinishing(true);
    try {
      await patch({ status: "completed" });
      router.push(destination);
    } finally {
      setFinishing(false);
    }
  }

  function handleLogFirstEntry() {
    const suggested = firstSuggestedCategory(noticedAreas);
    void finishAndGo(suggested ? `/dashboard?logCategory=${suggested}` : "/dashboard?firstLog=1");
  }

  return (
    <OnboardingScreen step="THE_LOOP">
      <p className="font-display text-2xl text-navy">{t("headline")}</p>

      <div className="relative mt-10 flex flex-col">
        <div className="absolute bottom-4 left-[5px] top-4 w-px bg-navy/15" aria-hidden="true" />

        <LoopStage label={t("trackLabel")} title={trackLabel}>
          <p className="mt-2 text-xs text-navy/50">{t("trackTreatmentsHint")}</p>
        </LoopStage>
        <LoopStage label={t("patternsLabel")} title={t("patternsTitle")}>
          <p className="mt-2 font-display italic text-navy/90">{t("patternsExample")}</p>
          <p className="mt-2 text-xs text-navy/50">{t("patternsCaveat")}</p>
        </LoopStage>
        <LoopStage label={t("briefLabel")} title={t("briefTitle")}>
          <p className="mt-2 text-sm text-navy/60">{t("briefBody")}</p>
        </LoopStage>
        <LoopStage label={t("conversationLabel")} title={t("conversationTitle")} last>
          <p className="mt-2 text-sm text-navy/60">{t("conversationBody")}</p>
        </LoopStage>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <Button onClick={handleLogFirstEntry} disabled={finishing}>
          {finishing ? "…" : t("logFirstEntry")}
        </Button>
        <button
          onClick={() => void finishAndGo("/dashboard")}
          disabled={finishing}
          className="text-sm text-navy/60 underline underline-offset-2 hover:text-navy disabled:opacity-50"
        >
          {t("goToDashboard")}
        </button>
      </div>
    </OnboardingScreen>
  );
}

function LoopStage({
  label,
  title,
  children,
  last,
}: {
  label: string;
  title: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`relative pl-7 ${last ? "" : "pb-8"}`}>
      <span
        className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-brass bg-bone"
        aria-hidden="true"
      />
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-brass">{label}</p>
      <p className="mt-1 text-[15px] text-navy">{title}</p>
      {children}
    </div>
  );
}
