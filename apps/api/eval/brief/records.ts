/**
 * Fifteen fictional BRIEF records for the offline evaluation harness.
 * Every person, date and entry here is invented. Nothing is drawn from
 * a real account, and nothing here may ever be replaced with real data.
 *
 * Each record is raw-ish input (dated symptom entries for the current
 * and previous periods, cycle counts, an optional treatment window);
 * pipeline.ts turns it into the AI input with the same deterministic
 * functions production uses.
 */
import type { Locale } from "../../src/lib/locale.js";

export type Category =
  | "HOT_FLASH"
  | "NIGHT_SWEATS"
  | "MOOD_CHANGE"
  | "SLEEP_DISTURBANCE"
  | "BRAIN_FOG"
  | "JOINT_PAIN"
  | "FATIGUE"
  | "ANXIETY"
  | "IRREGULAR_HEARTBEAT"
  | "VAGINAL_DRYNESS"
  | "LIBIDO_CHANGE"
  | "WEIGHT_CHANGE"
  | "HEADACHE"
  | "ANGER"
  | "IRRITABILITY"
  | "LOW_MOOD"
  | "PAINFUL_SEX"
  | "OTHER";
export type Severity = "MILD" | "MODERATE" | "SEVERE";

export interface EvalEntry {
  date: string; // YYYY-MM-DD, her local day
  category: Category;
  severity: Severity;
}

export interface EvalRecord {
  id: string;
  /** What this record exercises, in plain words. */
  scenario: string;
  coverage: Array<"sparse" | "complete" | "contradictory" | "missing" | "edge" | "insufficient">;
  locale: Locale;
  fromDate: string;
  toDate: string;
  current: EvalEntry[];
  previous: EvalEntry[];
  cycle: { averageCycleLengthDays: number | null; cycleCount: number; periodDaysLogged: number };
  treatment?: { id: string; startDate: string; beforeLogCount: number; afterLogCount: number };
}

const FROM = "2026-09-01";
const TO = "2026-09-30";

/** Entries for `category` on each listed day of September 2026. */
function days(
  category: Category,
  severity: Severity,
  dayNumbers: number[],
  month = "09",
): EvalEntry[] {
  return dayNumbers.map((d) => ({
    date: `2026-${month}-${String(d).padStart(2, "0")}`,
    category,
    severity,
  }));
}
/** The same, in the previous period (August 2026). */
const prev = (category: Category, severity: Severity, dayNumbers: number[]) =>
  days(category, severity, dayNumbers, "08");

const SEVERITIES: Severity[] = ["MILD", "MODERATE", "SEVERE"];

const ALL: Category[] = [
  "HOT_FLASH",
  "NIGHT_SWEATS",
  "MOOD_CHANGE",
  "SLEEP_DISTURBANCE",
  "BRAIN_FOG",
  "JOINT_PAIN",
  "FATIGUE",
  "ANXIETY",
  "IRREGULAR_HEARTBEAT",
  "VAGINAL_DRYNESS",
  "LIBIDO_CHANGE",
  "WEIGHT_CHANGE",
  "HEADACHE",
  "ANGER",
  "IRRITABILITY",
  "LOW_MOOD",
  "PAINFUL_SEX",
  "OTHER",
];

const COMPLETE_CURRENT = [
  ...days("HOT_FLASH", "MODERATE", [2, 3, 5, 8, 9, 12, 15, 16, 19, 22, 23, 26]),
  ...days("NIGHT_SWEATS", "SEVERE", [2, 3, 8, 9, 15, 16, 22]),
  ...days("SLEEP_DISTURBANCE", "MODERATE", [3, 9, 16, 23]),
  ...days("FATIGUE", "MILD", [4, 10, 17]),
];
const COMPLETE_PREVIOUS = [
  ...prev("HOT_FLASH", "MILD", [4, 11, 18, 25]),
  ...prev("NIGHT_SWEATS", "MODERATE", [5, 19]),
  ...prev("SLEEP_DISTURBANCE", "MODERATE", [6, 13, 20, 27]),
  ...prev("FATIGUE", "MODERATE", [1, 7, 14, 21, 28]),
];

export const EVAL_RECORDS: EvalRecord[] = [
  {
    id: "en-01-sparse-single-entry",
    scenario: "One entry in the whole period and nothing before it.",
    coverage: ["sparse", "insufficient"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: days("HEADACHE", "MILD", [14]),
    previous: [],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "en-02-no-entries",
    scenario: "No symptom entries and no cycle data at all.",
    coverage: ["missing", "insufficient"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: [],
    previous: [],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "en-03-complete",
    scenario: "Regular logging in both periods, a co-occurring pair and a treatment window.",
    coverage: ["complete"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: COMPLETE_CURRENT,
    previous: COMPLETE_PREVIOUS,
    cycle: { averageCycleLengthDays: 31, cycleCount: 2, periodDaysLogged: 9 },
    treatment: { id: "trt-eval-03", startDate: "2026-09-10", beforeLogCount: 14, afterLogCount: 9 },
  },
  {
    id: "en-04-contradictory",
    scenario:
      "Mild and severe recorded for the same symptom on the same days; one symptom up, another down.",
    coverage: ["contradictory"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: [
      ...days("SLEEP_DISTURBANCE", "MILD", [5, 6, 7, 12]),
      ...days("SLEEP_DISTURBANCE", "SEVERE", [5, 6, 7, 12]),
      ...days("ANXIETY", "MODERATE", [20]),
    ],
    previous: [
      ...prev("SLEEP_DISTURBANCE", "MODERATE", [3, 10]),
      ...prev("ANXIETY", "MODERATE", [1, 8, 15, 22, 29]),
    ],
    cycle: { averageCycleLengthDays: 26, cycleCount: 1, periodDaysLogged: 4 },
  },
  {
    id: "en-05-no-cycle-data",
    scenario: "Steady symptom logging with no cycle entries (missing cycle data).",
    coverage: ["missing"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: [
      ...days("JOINT_PAIN", "MODERATE", [2, 9, 16, 23, 30]),
      ...days("BRAIN_FOG", "MILD", [4, 11]),
    ],
    previous: [...prev("JOINT_PAIN", "MILD", [5, 19]), ...prev("BRAIN_FOG", "MILD", [6, 13, 20])],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "en-06-unchanged",
    scenario: "Identical counts in both periods, so no frequency pattern qualifies.",
    coverage: ["edge", "insufficient"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: days("FATIGUE", "MODERATE", [3, 10, 17, 24]),
    previous: prev("FATIGUE", "MODERATE", [3, 10, 17, 24]),
    cycle: { averageCycleLengthDays: 28, cycleCount: 1, periodDaysLogged: 5 },
  },
  {
    id: "en-07-co-occurrence-at-threshold",
    scenario: "Two symptoms share exactly three days, the minimum for a co-occurrence pattern.",
    coverage: ["edge"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: [
      ...days("HEADACHE", "MODERATE", [6, 13, 20]),
      ...days("IRRITABILITY", "MILD", [6, 13, 20]),
    ],
    previous: [],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "en-08-co-occurrence-below-threshold",
    scenario: "Two symptoms share only two days: no co-occurrence pattern may appear.",
    coverage: ["edge", "insufficient"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: [
      ...days("HEADACHE", "MODERATE", [6, 13, 21]),
      ...days("IRRITABILITY", "MILD", [6, 13, 27]),
    ],
    previous: [
      ...prev("HEADACHE", "MODERATE", [6, 13, 21]),
      ...prev("IRRITABILITY", "MILD", [6, 13, 27]),
    ],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "en-09-every-category",
    scenario:
      "All 17 named symptoms plus Other logged: the largest input, for length and truncation.",
    coverage: ["edge", "complete"],
    locale: "en",
    fromDate: FROM,
    toDate: TO,
    current: ALL.flatMap((c, i) =>
      days(c, SEVERITIES[i % 3]!, [1 + (i % 28), 2 + (i % 27), 3 + (i % 26)]),
    ),
    previous: ALL.filter((_, i) => i % 2 === 0).flatMap((c, i) => prev(c, "MILD", [1 + (i % 28)])),
    cycle: { averageCycleLengthDays: 35, cycleCount: 1, periodDaysLogged: 6 },
  },
  {
    id: "fr-10-complete",
    scenario: "The complete record, in French.",
    coverage: ["complete"],
    locale: "fr",
    fromDate: FROM,
    toDate: TO,
    current: COMPLETE_CURRENT,
    previous: COMPLETE_PREVIOUS,
    cycle: { averageCycleLengthDays: 31, cycleCount: 2, periodDaysLogged: 9 },
    treatment: { id: "trt-eval-10", startDate: "2026-09-10", beforeLogCount: 14, afterLogCount: 9 },
  },
  {
    id: "fr-11-sparse",
    scenario: "Two entries, French.",
    coverage: ["sparse", "insufficient"],
    locale: "fr",
    fromDate: FROM,
    toDate: TO,
    current: [...days("HOT_FLASH", "MILD", [3]), ...days("LOW_MOOD", "MODERATE", [17])],
    previous: [],
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 2 },
  },
  {
    id: "fr-12-contradictory",
    scenario: "The contradictory record, in French.",
    coverage: ["contradictory"],
    locale: "fr",
    fromDate: FROM,
    toDate: TO,
    current: [
      ...days("SLEEP_DISTURBANCE", "MILD", [5, 6, 7, 12]),
      ...days("SLEEP_DISTURBANCE", "SEVERE", [5, 6, 7, 12]),
      ...days("ANXIETY", "MODERATE", [20]),
    ],
    previous: [
      ...prev("SLEEP_DISTURBANCE", "MODERATE", [3, 10]),
      ...prev("ANXIETY", "MODERATE", [1, 8, 15, 22, 29]),
    ],
    cycle: { averageCycleLengthDays: 26, cycleCount: 1, periodDaysLogged: 4 },
  },
  {
    id: "ja-13-complete",
    scenario: "The complete record, in Japanese.",
    coverage: ["complete"],
    locale: "ja",
    fromDate: FROM,
    toDate: TO,
    current: COMPLETE_CURRENT,
    previous: COMPLETE_PREVIOUS,
    cycle: { averageCycleLengthDays: 31, cycleCount: 2, periodDaysLogged: 9 },
    treatment: { id: "trt-eval-13", startDate: "2026-09-10", beforeLogCount: 14, afterLogCount: 9 },
  },
  {
    id: "ja-14-missing-data",
    scenario: "No entries this period, a few last period, no cycle data. Japanese.",
    coverage: ["missing", "insufficient"],
    locale: "ja",
    fromDate: FROM,
    toDate: TO,
    current: [],
    previous: prev("NIGHT_SWEATS", "MILD", [9, 23]),
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
  },
  {
    id: "ja-15-treatment-too-recent",
    scenario:
      "A treatment started two days before the period ended: too soon for its window. Japanese.",
    coverage: ["edge", "insufficient"],
    locale: "ja",
    fromDate: FROM,
    toDate: TO,
    current: days("HOT_FLASH", "SEVERE", [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]),
    previous: prev("HOT_FLASH", "SEVERE", [1, 8, 15, 22, 29]),
    cycle: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
    treatment: { id: "trt-eval-15", startDate: "2026-09-28", beforeLogCount: 5, afterLogCount: 1 },
  },
];
