"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../../../lib/onboarding-context";
import { OnboardingScreen } from "../../../components/onboarding-screen";
import { Button } from "../../../components/button";
import { ONBOARDING_AREA_LABELS, firstSuggestedCategory } from "../../../lib/onboarding-areas";

export default function TheLoopScreen() {
  const router = useRouter();
  const { profile, patch } = useOnboarding();
  const [finishing, setFinishing] = useState(false);

  const noticedAreas = profile?.noticedAreas ?? [];
  const trackLabel =
    noticedAreas.length > 0
      ? noticedAreas.map((a) => ONBOARDING_AREA_LABELS[a] ?? a).join(" · ")
      : "Sleep · Energy · Mood";

  async function finishAndGo(destination: string) {
    setFinishing(true);
    try {
      await patch({ status: "completed" });
      router.push(destination);
    } finally {
      setFinishing(false);
    }
  }

  function handleLogFirstEntry() {
    const suggested = firstSuggestedCategory(noticedAreas);
    void finishAndGo(suggested ? `/dashboard?logCategory=${suggested}` : "/dashboard?firstLog=1");
  }

  return (
    <OnboardingScreen step="THE_LOOP">
      <p className="font-display text-2xl text-navy">Here&apos;s how EMBR works.</p>

      <div className="relative mt-10 flex flex-col">
        <div className="absolute bottom-4 left-[5px] top-4 w-px bg-navy/15" aria-hidden="true" />

        <LoopStage label="Track" title={trackLabel} />
        <LoopStage
          label="Patterns"
          title="Once you've logged for a couple of weeks, you might see something like:"
        >
          <p className="mt-2 font-display italic text-navy/90">
            &quot;Your sleep disruption appeared alongside lower energy on 6 days.&quot;
          </p>
          <p className="mt-2 text-xs text-navy/50">
            Descriptive, not diagnostic. EMBR never tells you what&apos;s causing something.
          </p>
        </LoopStage>
        <LoopStage label="Brief" title="Evidence · Patterns · Questions">
          <p className="mt-2 text-sm text-navy/60">
            A structured summary of your record, built when you&apos;re ready. Not automatically.
          </p>
        </LoopStage>
        <LoopStage
          label="Healthcare conversation"
          title="Something concrete to bring into your next appointment."
          last
        >
          <p className="mt-2 text-sm text-navy/60">Entirely optional, and entirely yours.</p>
        </LoopStage>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <Button onClick={handleLogFirstEntry} disabled={finishing}>
          {finishing ? "…" : "Log your first entry"}
        </Button>
        <button
          onClick={() => void finishAndGo("/dashboard")}
          disabled={finishing}
          className="text-sm text-navy/60 underline underline-offset-2 hover:text-navy disabled:opacity-50"
        >
          Go to dashboard instead
        </button>
      </div>
    </OnboardingScreen>
  );
}

function LoopStage({
  label,
  title,
  children,
  last,
}: {
  label: string;
  title: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`relative pl-7 ${last ? "" : "pb-8"}`}>
      <span
        className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-brass bg-bone"
        aria-hidden="true"
      />
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-brass">{label}</p>
      <p className="mt-1 text-[15px] text-navy">{title}</p>
      {children}
    </div>
  );
}
