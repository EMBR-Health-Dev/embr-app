"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BrandWordmark } from "./brand-wordmark";
import { useOnboarding } from "../lib/onboarding-context";
import { ONBOARDING_STEPS, type OnboardingStep } from "../lib/onboarding-steps";

export function OnboardingScreen({
  step,
  children,
}: {
  step: OnboardingStep;
  children: React.ReactNode;
}) {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const { patch } = useOnboarding();
  const index = ONBOARDING_STEPS.indexOf(step);

  async function handleSkip() {
    await patch({ status: "skipped" });
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between gap-4">
          <BrandWordmark className="h-[15px] text-foreground" />
          <button
            onClick={() => void handleSkip()}
            className="text-xs font-medium text-foreground/50 underline underline-offset-2 hover:text-foreground"
          >
            {t("skipToDashboard")}
          </button>
        </div>
        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-[3px] w-6 rounded-full transition-colors ${
                i <= index ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </main>
  );
}
