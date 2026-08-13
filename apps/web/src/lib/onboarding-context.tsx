"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { OnboardingProfileDto } from "@embr/types";
import { api } from "./api";

interface OnboardingPatchInput {
  currentStep?: string;
  jobToBeDone?: string;
  noticedAreas?: string[];
  appointmentStatus?: string;
  status?: "completed" | "skipped";
}

interface OnboardingContextValue {
  profile: OnboardingProfileDto | null;
  loading: boolean;
  patch: (input: OnboardingPatchInput) => Promise<OnboardingProfileDto>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<OnboardingProfileDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.onboarding
      .get()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  async function patch(input: OnboardingPatchInput): Promise<OnboardingProfileDto> {
    const updated = await api.onboarding.patch(input);
    setProfile(updated);
    return updated;
  }

  return (
    <OnboardingContext.Provider value={{ profile, loading, patch }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within an OnboardingProvider");
  return ctx;
}
