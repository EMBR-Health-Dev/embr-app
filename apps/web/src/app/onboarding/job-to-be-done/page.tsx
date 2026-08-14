"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

const OPTION_VALUES = [
  "UNDERSTAND_EXPERIENCE",
  "UNDERSTAND_PATTERNS",
  "PREPARE_FOR_APPOINTMENT",
  "KEEP_RECORD",
  "NOT_SURE",
] as const;

const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  UNDERSTAND_EXPERIENCE: "understandExperience",
  UNDERSTAND_PATTERNS: "understandPatterns",
  PREPARE_FOR_APPOINTMENT: "prepareForAppointment",
  KEEP_RECORD: "keepRecord",
  NOT_SURE: "notSure",
};

export default function JobToBeDoneScreen() {
  const t = useTranslations("Onboarding.jobToBeDone");
  const router = useRouter();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: string) {
    if (selected) return; // already advancing — ignore a second tap
    setSelected(value);
    await patch({ jobToBeDone: value, currentStep: "WHATS_GOING_ON" });
    // A brief, deliberate pause so the selection reads as registered,
    // not as an instant jump — "immediate and intentional," not jarring.
    setTimeout(() => router.push(STEP_ROUTES.WHATS_GOING_ON), 320);
  }

  return (
    <OnboardingScreen step="JOB_TO_BE_DONE">
      <p className="font-display text-2xl text-navy">{t("headline")}</p>
      <p className="mt-3 text-sm text-navy/60">{t("hint")}</p>
      <div className="mt-8 flex flex-col">
        {OPTION_VALUES.map((value) => (
          <button
            key={value}
            onClick={() => void handleSelect(value)}
            className={`flex items-center justify-between border-b border-navy/10 py-4 text-left text-[15px] transition-colors ${
              selected === value ? "text-navy" : "text-navy/75 hover:text-navy"
            }`}
          >
            <span>{t(OPTION_KEYS[value])}</span>
            <span
              className={`ml-4 h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ${
                selected === value ? "bg-brass opacity-100" : "opacity-0"
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </OnboardingScreen>
  );
}
