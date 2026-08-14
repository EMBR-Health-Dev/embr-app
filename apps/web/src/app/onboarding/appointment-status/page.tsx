"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

const OPTION_VALUES = ["WITHIN_MONTH", "UNSURE_WHEN", "NO", "UNSURE"] as const;
const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  WITHIN_MONTH: "withinMonth",
  UNSURE_WHEN: "unsureWhen",
  NO: "no",
  UNSURE: "unsure",
};

export default function AppointmentStatusScreen() {
  const t = useTranslations("Onboarding.appointmentStatus");
  const router = useRouter();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: string) {
    if (selected) return;
    setSelected(value);
    await patch({ appointmentStatus: value, currentStep: "THE_LOOP" });
    setTimeout(() => router.push(STEP_ROUTES.THE_LOOP), 320);
  }

  return (
    <OnboardingScreen step="APPOINTMENT_STATUS">
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
