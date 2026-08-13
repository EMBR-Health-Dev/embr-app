"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../lib/onboarding-context";
import { STEP_ROUTES, isOnboardingStep } from "../../lib/onboarding-steps";

export default function OnboardingIndex() {
  const router = useRouter();
  const { profile, loading } = useOnboarding();

  useEffect(() => {
    if (loading) return;
    const currentStep = profile?.currentStep ?? null;
    const step = isOnboardingStep(currentStep) ? currentStep : "WELCOME";
    router.replace(STEP_ROUTES[step]);
  }, [loading, profile, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bone">
      <p className="text-navy/50">Loading…</p>
    </main>
  );
}
