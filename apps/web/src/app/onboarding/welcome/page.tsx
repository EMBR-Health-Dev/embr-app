"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { Button } from "../../../components/button";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

export default function WelcomeScreen() {
  const router = useRouter();
  const { patch } = useOnboarding();
  const [starting, setStarting] = useState(false);

  async function handleContinue() {
    setStarting(true);
    try {
      await patch({ currentStep: "JOB_TO_BE_DONE" });
      router.push(STEP_ROUTES.JOB_TO_BE_DONE);
    } finally {
      setStarting(false);
    }
  }

  return (
    <OnboardingScreen step="WELCOME">
      <p className="font-display text-[28px] leading-[1.3] text-navy">
        A place to keep track of what&apos;s actually happening to you.
      </p>
      <p className="mt-6 text-[15px] leading-relaxed text-navy/70">
        EMBR helps you turn what you&apos;re experiencing into something you can look back on,
        understand, and eventually bring into a conversation with your doctor. It doesn&apos;t
        diagnose you or replace your clinician. It helps you organize your own record, on your own
        terms.
      </p>
      <Button
        onClick={() => void handleContinue()}
        disabled={starting}
        className="mt-10 self-start"
      >
        {starting ? "…" : "Get started"}
      </Button>
    </OnboardingScreen>
  );
}
