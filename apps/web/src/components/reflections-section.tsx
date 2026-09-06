"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReflectionDto } from "@embr/types";
import { api } from "../lib/api";
import { ReflectionCard } from "./reflection-card";

/**
 * `refreshKey` is expected to change whenever a new symptom log is
 * successfully submitted (see dashboard/page.tsx) — same contract as
 * apps/mobile/components/reflections-section.tsx's identical prop:
 * logging something new can immediately surface a reflection that
 * wasn't there before (e.g. crossing the 3-log threshold), without
 * this component polling on its own.
 *
 * Unlike the mobile version, an in-flight ref additionally guards
 * against issuing a second, overlapping request while one is already
 * running. A bare "skip if in flight" guard is not safe on its own,
 * though: if refreshKey changes again mid-fetch, the skipped effect
 * registers no cleanup, and when the original fetch's own `cancelled`
 * flag was already flipped true by *that* refreshKey change's cleanup
 * (React always runs the previous effect's cleanup before the next
 * one), its result is discarded — and nothing else was scheduled to
 * ever fetch again. The result: a log submitted while the initial
 * fetch is still in flight would silently never be reflected, not
 * even "next load" as one might assume, since no later effect run
 * exists in that session to pick it up. Confirmed directly by tracing
 * the sequence, not assumed.
 *
 * `generation` closes that gap with the simplest mechanism that still
 * gets a genuinely fresh (non-cancelled) effect closure to retry with:
 * if a refreshKey change is skipped because a fetch was already in
 * flight, `pendingRefetch` records that, and once the in-flight fetch
 * finishes, bumping `generation` triggers one more effect run — a real
 * new invocation, not a call back into the stale one — which then
 * fetches normally.
 */
export function ReflectionsSection({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations("Reflections");
  const [reflections, setReflections] = useState<ReflectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const inFlight = useRef(false);
  const pendingRefetch = useRef(false);

  useEffect(() => {
    if (inFlight.current) {
      pendingRefetch.current = true;
      return;
    }
    inFlight.current = true;

    let cancelled = false;
    // Matches React's own documented fetch-on-mount pattern — same
    // suppression reasoning as co-occurrence-card.tsx.
    setLoading(true);

    api.reflections
      .list()
      .then((data) => {
        if (!cancelled) setReflections(data);
      })
      .catch(() => {
        // Fails quietly, same convention as CoOccurrenceCard and the
        // mobile equivalent of this component — a supplementary
        // surface, not core functionality. The rest of the dashboard
        // (logging, recent logs) works either way.
        if (!cancelled) setReflections([]);
      })
      .finally(() => {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
        if (pendingRefetch.current) {
          pendingRefetch.current = false;
          setGeneration((g) => g + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, generation]);

  async function handleDismiss(reflection: ReflectionDto) {
    setReflections((prev) => prev.filter((r) => r.key !== reflection.key));
    try {
      await api.reflections.dismiss({ type: reflection.type, key: reflection.key });
    } catch {
      // Didn't stick server-side — put it back rather than let the
      // dismissal silently fail to persist.
      setReflections((prev) => [...prev, reflection]);
    }
  }

  // Loading, empty, and errored (folded into "empty" above) all
  // render nothing — same as apps/mobile: a person shouldn't see an
  // empty or broken-looking section for what's an optional,
  // supplementary surface, and nothing else on the dashboard depends
  // on it.
  if (loading || reflections.length === 0) return null;

  return (
    <section className="mt-6 flex flex-col gap-3" aria-label={t("heading")}>
      <h2 className="text-sm font-medium text-navy/60">{t("heading")}</h2>
      {reflections.map((reflection) => (
        <ReflectionCard
          key={`${reflection.type}:${reflection.key}`}
          reflection={reflection}
          onDismiss={() => void handleDismiss(reflection)}
        />
      ))}
    </section>
  );
}
