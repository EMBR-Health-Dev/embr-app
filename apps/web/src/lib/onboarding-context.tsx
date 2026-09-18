"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { OnboardingProfileDto } from "@embr/types";
import { api } from "./api";
import { useAuth } from "./auth-context";

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
  const { refresh: refreshAuth } = useAuth();

  useEffect(() => {
    api.onboarding
      .get()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  async function patch(input: OnboardingPatchInput): Promise<OnboardingProfileDto> {
    const updated = await api.onboarding.patch(input);
    setProfile(updated);
    // `status` is the only patch that changes onboardingCompletedAt,
    // which AuthProvider's `user` carries as its own separately-fetched
    // field (see auth.routes.ts's GET /auth/me). Without this, a caller
    // that navigates straight to /dashboard right after finishing or
    // skipping onboarding hits a `user` that still looks incomplete —
    // dashboard/page.tsx bounces it straight back to /onboarding, which
    // then redirects to whatever step is current, so the navigation
    // silently appears to do nothing. Awaited here so that redirect has
    // already resolved by the time the caller navigates.
    if (input.status) {
      await refreshAuth();
    }
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
