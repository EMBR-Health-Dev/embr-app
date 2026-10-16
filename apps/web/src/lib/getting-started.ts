/**
 * What a new account sees first: a short checklist for the first two
 * weeks, and, once there is a week of records but no BRIEF yet, a nudge
 * to create one. Derived only from facts the dashboard already loads,
 * so it adds no request and never reads anything new about the person.
 */

export const GETTING_STARTED_DAYS = 14;
export const FIRST_BRIEF_AFTER_DAYS = 7;

export type StartStepKey = "logToday" | "lifeStage" | "aWeek" | "firstBrief";

export interface StartStep {
  key: StartStepKey;
  done: boolean;
  href: string;
}

export interface GettingStartedInput {
  accountCreatedAt: string;
  /** YYYY-MM-DD of the earliest entry, or null for an empty record. */
  recordStart: string | null;
  symptomCount: number;
  hasLifeStage: boolean;
  hasBrief: boolean;
  now?: Date;
}

function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function recordSpansAWeek(recordStart: string | null, now: Date): boolean {
  return recordStart !== null && daysBetween(recordStart, now) >= FIRST_BRIEF_AFTER_DAYS - 1;
}

/** The checklist, or null once the account is past its first two weeks or every step is done. */
export function startSteps(input: GettingStartedInput): StartStep[] | null {
  const now = input.now ?? new Date();
  if (daysBetween(input.accountCreatedAt, now) >= GETTING_STARTED_DAYS) return null;
  const steps: StartStep[] = [
    { key: "logToday", done: input.symptomCount > 0, href: "/dashboard?firstLog=1" },
    { key: "lifeStage", done: input.hasLifeStage, href: "/settings" },
    { key: "aWeek", done: recordSpansAWeek(input.recordStart, now), href: "/timeline" },
    { key: "firstBrief", done: input.hasBrief, href: "/brief" },
  ];
  return steps.every((s) => s.done) ? null : steps;
}

/** A week of records and no BRIEF yet: the moment a first BRIEF becomes worth making. */
export function showsFirstBriefNudge(input: GettingStartedInput): boolean {
  return !input.hasBrief && recordSpansAWeek(input.recordStart, input.now ?? new Date());
}
