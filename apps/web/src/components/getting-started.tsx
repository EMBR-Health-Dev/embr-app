"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { showsFirstBriefNudge, startSteps, type GettingStartedInput } from "../lib/getting-started";

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

// Tells this tab's own cards when one is dismissed; other tabs hear the
// browser's storage event.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeDismissed(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private mode or blocked storage: it simply shows again next visit.
  }
  listeners.forEach((l) => l());
}

/** Dismissed on the server render, so nothing flashes before the browser is read. */
function useDismissed(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readDismissed(key),
    () => true,
  );
}

/**
 * "Start here" for a new account, and the first BRIEF nudge after a
 * week of records. Each can be dismissed; that choice is remembered on
 * this browser only, and nothing about it is sent anywhere.
 */
export function GettingStarted({ userId, ...input }: GettingStartedInput & { userId: string }) {
  const t = useTranslations("GettingStarted");
  const startKey = `embr:start-here-dismissed:${userId}`;
  const nudgeKey = `embr:first-brief-nudge-dismissed:${userId}`;
  const dismissed = { start: useDismissed(startKey), nudge: useDismissed(nudgeKey) };

  const steps = startSteps(input);
  const nudge = showsFirstBriefNudge(input);

  if (nudge && !dismissed.nudge) {
    return (
      <section
        aria-labelledby="first-brief-nudge"
        className="mt-8 rounded border border-lilac-300 bg-lilac-100 p-5"
      >
        <h2 id="first-brief-nudge" className="font-display text-heading-m text-foreground">
          {t("nudgeTitle")}
        </h2>
        <p className="mt-2 text-sm text-graphite-700">{t("nudgeBody")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link
            href="/brief"
            className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("nudgeAction")}
          </Link>
          <button
            type="button"
            onClick={() => {
              writeDismissed(nudgeKey);
            }}
            className="text-sm text-graphite-700 underline underline-offset-2"
          >
            {t("notNow")}
          </button>
        </div>
      </section>
    );
  }

  if (!steps || dismissed.start) return null;

  return (
    <section aria-labelledby="start-here" className="mt-8 rounded border border-border-subtle p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="start-here" className="font-display text-heading-m text-foreground">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => {
            writeDismissed(startKey);
          }}
          className="text-xs text-graphite-700 underline underline-offset-2"
        >
          {t("hide")}
        </button>
      </div>
      <p className="mt-1 text-sm text-graphite-700">{t("intro")}</p>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                step.done
                  ? "border-graphite-900 bg-graphite-900 text-pearl-50"
                  : "border-border text-graphite-700"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className="flex-1">
              <span className="sr-only">{step.done ? t("doneLabel") : t("todoLabel")} </span>
              {step.done ? (
                <span className="text-graphite-700 line-through">
                  {t(`steps.${step.key}.title`)}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  {t(`steps.${step.key}.title`)}
                </Link>
              )}
              {!step.done && (
                <span className="mt-0.5 block text-graphite-700">
                  {t(`steps.${step.key}.body`)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
