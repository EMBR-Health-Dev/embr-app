"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "UNDERSTAND_EXPERIENCE", label: "Understand what I'm experiencing" },
  { value: "UNDERSTAND_PATTERNS", label: "Understand patterns over time" },
  { value: "PREPARE_FOR_APPOINTMENT", label: "Prepare for a healthcare conversation" },
  { value: "KEEP_RECORD", label: "Keep a better record, long term" },
  { value: "NOT_SURE", label: "Not sure yet" },
];

export default function JobToBeDoneScreen() {
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
      <p className="font-display text-2xl text-navy">What do you want EMBR to help you with?</p>
      <p className="mt-3 text-sm text-navy/60">
        This just shapes what we show you first. You can always change your mind later.
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
