"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { Button } from "../../../components/button";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";

export default function WelcomeScreen() {
  const t = useTranslations("Onboarding.welcome");
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
      <p className="font-display text-[28px] leading-[1.3] text-navy">{t("headline")}</p>
      <p className="mt-6 text-[15px] leading-relaxed text-navy/70">{t("body")}</p>
      <Button
        onClick={() => void handleContinue()}
        disabled={starting}
        className="mt-10 self-start"
      >
        {starting ? "…" : t("getStarted")}
      </Button>
    </OnboardingScreen>
  );
}
