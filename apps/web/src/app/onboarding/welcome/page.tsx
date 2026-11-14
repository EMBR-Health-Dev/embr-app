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
      await patch({ currentStep: "WHATS_GOING_ON" });
      router.push(STEP_ROUTES.WHATS_GOING_ON);
    } finally {
      setStarting(false);
    }
  }

  return (
    <OnboardingScreen step="WELCOME">
      <p className="font-display text-heading-l text-foreground">{t("headline")}</p>
      <p className="mt-6 text-base leading-relaxed text-foreground/70">{t("body")}</p>
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
