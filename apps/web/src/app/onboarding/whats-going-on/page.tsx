"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { Button } from "../../../components/button";
import { STEP_ROUTES } from "../../../lib/onboarding-steps";
import { ONBOARDING_AREA_LABELS } from "../../../lib/onboarding-areas";

const AREAS = Object.keys(ONBOARDING_AREA_LABELS);

export default function WhatsGoingOnScreen() {
  const router = useRouter();
  const { profile, loading, patch } = useOnboarding();
  // Lazy initializer covers the case where profile is already populated
  // at this component's very first render — e.g. the person navigated
  // forward then used the browser's back button; OnboardingProvider
  // stays mounted across that navigation, so profile is already
  // available, not still null.
  const [selected, setSelected] = useState<string[]>(() => profile?.noticedAreas ?? []);
  const [saving, setSaving] = useState(false);

  // React's own documented pattern for "adjust local editable state
  // once an async value arrives" (react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — a conditional setState guarded by comparing against the last-seen
  // profile, directly in the render body, not inside a useEffect. This
  // covers the *other* case the lazy initializer above doesn't: profile
  // is still null at mount (the real first-load-of-the-app case) and
  // only becomes available afterward, once OnboardingProvider's fetch
  // resolves.
  const [syncedProfile, setSyncedProfile] = useState(profile);
  if (profile !== syncedProfile) {
    setSyncedProfile(profile);
    if (profile) setSelected(profile.noticedAreas);
  }

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await patch({ noticedAreas: selected, currentStep: "APPOINTMENT_STATUS" });
      router.push(STEP_ROUTES.APPOINTMENT_STATUS);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <OnboardingScreen step="WHATS_GOING_ON">
        <p className="text-navy/50">Loading…</p>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen step="WHATS_GOING_ON">
      <p className="font-display text-2xl text-navy">What have you noticed lately?</p>
      <p className="mt-3 text-sm text-navy/60">
        Pick anything that&apos;s felt different. This isn&apos;t a log yet. It just helps your
        first check-in feel like it already knows you.
      </p>
      <div className="mt-8 flex flex-wrap gap-2.5">
        {AREAS.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggle(value)}
              aria-pressed={isSelected}
              className={`rounded-sm border px-4 py-2 text-sm transition-colors ${
                isSelected
                  ? "border-navy bg-navy text-bone"
                  : "border-navy/20 text-navy/75 hover:border-navy/40"
              }`}
            >
              {ONBOARDING_AREA_LABELS[value]}
            </button>
          );
        })}
      </div>
      <Button onClick={() => void handleContinue()} disabled={saving} className="mt-10 self-start">
        {saving ? "…" : "Continue"}
      </Button>
    </OnboardingScreen>
  );
}
