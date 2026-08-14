"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "WITHIN_MONTH", label: "Yes, within the next month" },
  { value: "UNSURE_WHEN", label: "Yes, but I'm not sure when" },
  { value: "NO", label: "No" },
  { value: "UNSURE", label: "I'm not sure yet" },
];

export default function AppointmentStatusScreen() {
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
      <p className="font-display text-2xl text-navy">
        Do you have a healthcare appointment coming up?
      </p>
      <p className="mt-3 text-sm text-navy/60">
        No need for the exact date yet. Just helps us know whether to keep BRIEF close at hand.
      </p>
      <div className="mt-8 flex flex-col">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => void handleSelect(opt.value)}
            className={`flex items-center justify-between border-b border-navy/10 py-4 text-left text-[15px] transition-colors ${
              selected === opt.value ? "text-navy" : "text-navy/75 hover:text-navy"
            }`}
          >
            <span>{opt.label}</span>
            <span
              className={`ml-4 h-1.5 w-1.5 shrink-0 rounded-full transition-opacity ${
                selected === opt.value ? "bg-brass opacity-100" : "opacity-0"
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </OnboardingScreen>
  );
}
