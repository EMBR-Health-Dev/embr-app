import type { SeverityLevel, SymptomCategory } from "@embr/types";
import {
  severityLevelSchema,
  symptomCategorySchema,
  type SaveBaselineCheckInInput,
} from "@embr/validation";
import { ONBOARDING_AREA_TO_CATEGORIES } from "./onboarding-areas";

/**
 * Whether this build offers the account free first check in at
 * /check-in. Off unless NEXT_PUBLIC_FIRST_CHECK_IN_ENABLED is "true".
 *
 * Everything here runs on the device. Nothing she answers is sent to
 * EMBR, an AI service, analytics or error reports: the answers live in
 * this tab's session storage and are gone when the tab closes. Saving
 * them to an account is a later, separate step that needs her consent.
 */
export const FIRST_CHECK_IN_ENABLED = process.env.NEXT_PUBLIC_FIRST_CHECK_IN_ENABLED === "true";

export const GOALS = [
  "UNDERSTAND_EXPERIENCE",
  "UNDERSTAND_PATTERNS",
  "PREPARE_FOR_APPOINTMENT",
  "KEEP_RECORD",
  "NOT_SURE",
] as const;
export type Goal = (typeof GOALS)[number];

/** How often over the last two weeks, as she recalls it. */
export const FREQUENCIES = ["FEW_DAYS", "HALF_THE_DAYS", "MOST_DAYS"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SLEEP_OPTIONS = ["UNDER_6H", "SIX_TO_SEVEN_H", "SEVEN_PLUS_H"] as const;
export const WORK_OPTIONS = ["NONE", "DID_LESS", "MISSED_TIME"] as const;

// "Other" needs words to mean anything, and this check in has no free
// text field at all, so it is left out, as in the daily check in.
export const FIRST_CHECK_IN_CATEGORIES: SymptomCategory[] = symptomCategorySchema.options.filter(
  (c) => c !== "OTHER",
);

export const STEPS = ["promise", "symptoms", "details", "context", "result"] as const;
export type Step = (typeof STEPS)[number];

export interface SymptomAnswer {
  category: SymptomCategory;
  severity: SeverityLevel | null;
  frequency: Frequency | null;
}

export interface FirstCheckInAnswers {
  version: 1;
  step: Step;
  goal: Goal | null;
  symptoms: SymptomAnswer[];
  /** She chose "none of these" on the symptoms step. Different from
   * skipping it: both leave the list empty, only this one is an answer. */
  noneOfThese: boolean;
  sleep: (typeof SLEEP_OPTIONS)[number] | null;
  work: (typeof WORK_OPTIONS)[number] | null;
}

function oneOfOrNull<T extends string>(options: readonly T[], value: unknown): value is T | null {
  return value === null || options.includes(value as T);
}

/** True only for answers this version wrote; anything else is dropped. */
function isAnswers(value: unknown): value is FirstCheckInAnswers {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !STEPS.includes(v.step as Step)) return false;
  if (!oneOfOrNull(GOALS, v.goal) || !oneOfOrNull(SLEEP_OPTIONS, v.sleep)) return false;
  if (!oneOfOrNull(WORK_OPTIONS, v.work) || !Array.isArray(v.symptoms)) return false;
  // Absent in answers written before this field existed; read as false.
  if (v.noneOfThese !== undefined && typeof v.noneOfThese !== "boolean") return false;
  const seen = new Set<string>();
  return v.symptoms.every((s: unknown) => {
    if (typeof s !== "object" || s === null) return false;
    const a = s as Record<string, unknown>;
    const category = a.category as SymptomCategory;
    if (!FIRST_CHECK_IN_CATEGORIES.includes(category) || seen.has(category)) return false;
    seen.add(category);
    return (
      oneOfOrNull(severityLevelSchema.options, a.severity) && oneOfOrNull(FREQUENCIES, a.frequency)
    );
  });
}

export function emptyAnswers(): FirstCheckInAnswers {
  return {
    version: 1,
    step: "promise",
    goal: null,
    symptoms: [],
    noneOfThese: false,
    sleep: null,
    work: null,
  };
}

// Session storage, not local storage: on a shared or borrowed computer
// the answers must not outlive the tab.
export const STORAGE_KEY = "embr.firstCheckIn.v1";

/** Her answers so far in this tab, or a fresh start. Anything that does
 * not parse is dropped rather than half restored. */
export function loadAnswers(): FirstCheckInAnswers {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAnswers();
    const parsed: unknown = JSON.parse(raw);
    return isAnswers(parsed)
      ? { ...parsed, noneOfThese: parsed.noneOfThese === true && parsed.symptoms.length === 0 }
      : emptyAnswers();
  } catch {
    return emptyAnswers();
  }
}

export function saveAnswers(answers: FirstCheckInAnswers): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Storage blocked (private mode, full): the check in still works in
    // memory; a reload starts again.
  }
}

export function clearAnswers(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** Result groups, in the order the onboarding uses for the same areas. */
export const AREAS = ["SLEEP", "ENERGY", "MOOD", "BODY", "FOCUS"] as const;
export type Area = (typeof AREAS)[number];

export type ResultSymptom = SymptomAnswer;

export interface FirstCheckInResult {
  groups: Array<{ area: Area; symptoms: ResultSymptom[] }>;
  /** The symptom she reported most often, then most strongly; null with none. */
  leading: ResultSymptom | null;
  /** Up to three symptom names for the "connected" question, in rank order. */
  ranked: ResultSymptom[];
  nextStep: "TRACK_A_WEEK" | "KEEP_FOR_APPOINTMENT";
  questions: Array<"main" | "together" | "sooner" | "track" | "general">;
}

const FREQUENCY_RANK: Record<Frequency, number> = { FEW_DAYS: 1, HALF_THE_DAYS: 2, MOST_DAYS: 3 };
const SEVERITY_RANK: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

function areaOf(category: SymptomCategory): Area {
  return AREAS.find((a) => ONBOARDING_AREA_TO_CATEGORIES[a]?.includes(category)) ?? "BODY";
}

/**
 * What the result page shows, worked out from her answers alone. It
 * describes what she reported and nothing more: no score, no
 * comparison with anyone else, no cause and no diagnosis. Ranking only
 * chooses which symptom the clinician questions mention first.
 */
export function buildResult(answers: FirstCheckInAnswers): FirstCheckInResult {
  const symptoms: ResultSymptom[] = answers.symptoms.map((s) => ({ ...s }));

  const groups = AREAS.map((area) => ({
    area,
    symptoms: FIRST_CHECK_IN_CATEGORIES.filter((c) => areaOf(c) === area).flatMap((c) =>
      symptoms.filter((s) => s.category === c),
    ),
  })).filter((g) => g.symptoms.length > 0);

  // Stable: symptoms tied on both keep the order she picked them in.
  const ranked = [...symptoms].sort(
    (a, b) =>
      (b.frequency ? FREQUENCY_RANK[b.frequency] : 0) -
        (a.frequency ? FREQUENCY_RANK[a.frequency] : 0) ||
      (b.severity ? SEVERITY_RANK[b.severity] : 0) - (a.severity ? SEVERITY_RANK[a.severity] : 0),
  );

  const questions: FirstCheckInResult["questions"] = [];
  if (ranked.length >= 1) questions.push("main");
  if (ranked.length >= 2) questions.push("together");
  questions.push("sooner", "track");
  if (ranked.length === 0) questions.push("general");

  return {
    groups,
    leading: ranked[0] ?? null,
    ranked: ranked.slice(0, 3),
    nextStep: answers.goal === "PREPARE_FOR_APPOINTMENT" ? "KEEP_FOR_APPOINTMENT" : "TRACK_A_WEEK",
    questions: questions.slice(0, 3),
  };
}

/** What the baseline save sends: her answers as she gave them, with the
 * day and time zone she completed them in. Nothing else. */
export function baselineRequest(
  answers: FirstCheckInAnswers,
  completedOn: string,
  timeZone: string,
  locale: "en" | "ja" | "fr",
): SaveBaselineCheckInInput {
  return {
    completedOn,
    timeZone,
    locale,
    goal: answers.goal,
    sleepDuration: answers.sleep,
    workImpact: answers.work,
    // Picking symptoms or choosing "none of these" answers the question;
    // skipping it does not, so an empty list is never read as "no symptoms".
    symptomsAnswered: answers.symptoms.length > 0 || answers.noneOfThese,
    symptoms: answers.symptoms.map(({ category, severity, frequency }) => ({
      // OTHER is never offered and is dropped when answers are restored.
      category: category as Exclude<SymptomCategory, "OTHER">,
      severity,
      frequency,
    })),
  };
}
