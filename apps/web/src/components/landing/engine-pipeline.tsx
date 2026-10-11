"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

export const STAGES = ["capture", "compute", "trace", "explain"] as const;
const STEP_MS = 2400;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * The four stages, plus an example run that walks one entry through
 * them: the active stage lights up and its output is added to a log.
 * The data is a labelled example, not a real record. It plays on its
 * own unless the visitor prefers reduced motion, pauses on hover or
 * focus, and every step can also be chosen by hand.
 */
export function EnginePipeline() {
  const t = useTranslations("Landing.engine");
  const [step, setStep] = useState(0);
  // null until the visitor presses Play or Pause; until then it plays
  // only when reduced motion is not requested. The server snapshot is
  // "reduced", so the first paint is always a still frame.
  const [choice, setChoice] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);
  const playing = choice ?? !reducedMotion;

  useEffect(() => {
    if (!playing || hovered) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % STAGES.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <ol className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, i) => {
          const active = i === step;
          return (
            <li
              key={stage}
              data-active={active || undefined}
              className={`relative flex flex-col rounded-sm border bg-background p-6 transition-colors duration-500 motion-reduce:transition-none ${
                active ? "border-primary shadow-[0_0_0_1px_rgb(var(--primary))]" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.12em]">
                <span className="text-lilac-700">{String(i + 1).padStart(2, "0")}</span>
                <span className={active ? "text-lilac-700" : "text-graphite-500"}>
                  {t(`stages.${stage}.label`)}
                </span>
              </div>
              <h3 className="mt-5 font-display text-heading-m text-foreground">
                {t(`stages.${stage}.title`)}
              </h3>
              <p className="mt-3 flex-1 text-body-s text-graphite-700">
                {t(`stages.${stage}.body`)}
              </p>
              <code className="mt-5 block rounded-sm bg-lilac-100 px-3 py-2 font-mono text-xs text-lilac-700">
                {t(`stages.${stage}.spec`)}
              </code>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 overflow-hidden rounded-sm border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 font-mono text-xs">
          <span className="uppercase tracking-[0.12em] text-graphite-500">
            {t("run.title")}{" "}
            <span className="normal-case text-lilac-700">· {t("run.example")}</span>
          </span>
          <div className="flex items-center gap-1" role="group" aria-label={t("run.controls")}>
            {STAGES.map((stage, i) => (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  setStep(i);
                  setChoice(false);
                }}
                aria-pressed={i === step}
                aria-label={t("run.showStep", { label: t(`stages.${stage}.label`) })}
                className={`min-h-9 min-w-9 rounded-sm px-2 ${
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : "text-graphite-500 hover:text-foreground"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setChoice(!playing)}
              className="ml-2 min-h-9 rounded-sm border border-border px-3 text-foreground"
            >
              {playing ? t("run.pause") : t("run.play")}
            </button>
          </div>
        </div>

        <div className="h-1 bg-border-subtle" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${((step + 1) / STAGES.length) * 100}%` }}
          />
        </div>

        <ol className="space-y-2 px-4 py-4 font-mono text-xs leading-relaxed">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              aria-hidden={i > step || undefined}
              className={`flex gap-3 transition-opacity duration-500 motion-reduce:transition-none ${
                i > step ? "opacity-0" : i === step ? "opacity-100" : "opacity-60"
              }`}
            >
              <span className="shrink-0 text-lilac-700">
                {String(i + 1).padStart(2, "0")} {t(`stages.${stage}.label`).toLowerCase()}
              </span>
              <span className="text-foreground [overflow-wrap:anywhere]">
                {t(`run.output.${stage}`)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
