"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

// PREFER_NOT_TO_SAY is a client-only choice: it advances without
// storing anything, so lifeStage stays null.
const OPTION_VALUES = ["PERIMENOPAUSE", "POSTMENOPAUSE", "NOT_SURE", "PREFER_NOT_TO_SAY"] as const;
const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  PERIMENOPAUSE: "perimenopause",
  POSTMENOPAUSE: "postmenopause",
  NOT_SURE: "notSure",
  PREFER_NOT_TO_SAY: "preferNotToSay",
};

export default function LifeStageScreen() {
  const t = useTranslations("Onboarding.lifeStage");
  const router = useRouter();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: (typeof OPTION_VALUES)[number]) {
    if (selected) return;
    setSelected(value);
    await patch({
      ...(value !== "PREFER_NOT_TO_SAY" && { lifeStage: value }),
      currentStep: "WHATS_GOING_ON",
    });
    setTimeout(() => router.push(STEP_ROUTES.WHATS_GOING_ON), 320);
  }

  return (
    <OnboardingScreen step="LIFE_STAGE">
      <p className="font-display text-heading-xl text-foreground">{t("headline")}</p>
      <p className="mt-3 text-sm text-foreground/60">{t("hint")}</p>
      <div className="mt-8 flex flex-col">
        {OPTION_VALUES.map((value) => (
          <button
            key={value}
            onClick={() => void handleSelect(value)}
            className={`flex items-center justify-between border-b border-border-subtle py-4 text-left text-base transition-colors ${
              selected === value ? "text-foreground" : "text-foreground/75 hover:text-foreground"
            }`}
          >
            <span>{t(OPTION_KEYS[value])}</span>
            <span
              className={`ml-4 h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ${
                selected === value ? "bg-primary opacity-100" : "opacity-0"
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </OnboardingScreen>
  );
}
