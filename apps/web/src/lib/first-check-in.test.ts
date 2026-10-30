import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import fr from "../../messages/fr.json";
import { saveBaselineCheckInSchema } from "@embr/validation";
import {
  baselineRequest,
  buildResult,
  clearAnswers,
  emptyAnswers,
  loadAnswers,
  saveAnswers,
  STORAGE_KEY,
  type FirstCheckInAnswers,
} from "./first-check-in";

function answers(patch: Partial<FirstCheckInAnswers>): FirstCheckInAnswers {
  return { ...emptyAnswers(), step: "result", ...patch };
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("buildResult", () => {
  it("groups symptoms by area in the onboarding order", () => {
    const result = buildResult(
      answers({
        symptoms: [
          { category: "BRAIN_FOG", severity: "MILD", frequency: "FEW_DAYS" },
          { category: "HOT_FLASH", severity: "SEVERE", frequency: "MOST_DAYS" },
          { category: "NIGHT_SWEATS", severity: "MODERATE", frequency: "HALF_THE_DAYS" },
        ],
      }),
    );
    expect(result.groups.map((g) => g.area)).toEqual(["SLEEP", "BODY", "FOCUS"]);
    expect(result.groups.flatMap((g) => g.symptoms.map((s) => s.category))).toEqual([
      "NIGHT_SWEATS",
      "HOT_FLASH",
      "BRAIN_FOG",
    ]);
  });

  it("puts every check in category in an area", () => {
    const all = buildResult(
      answers({
        symptoms: (
          [
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
          ] as const
        ).map((category) => ({ category, severity: null, frequency: null })),
      }),
    );
    expect(all.groups.flatMap((g) => g.symptoms)).toHaveLength(13);
  });

  it("leads with the symptom reported most often, then most strongly", () => {
    const result = buildResult(
      answers({
        symptoms: [
          { category: "HEADACHE", severity: "SEVERE", frequency: "FEW_DAYS" },
          { category: "FATIGUE", severity: "MILD", frequency: "MOST_DAYS" },
          { category: "ANXIETY", severity: "MODERATE", frequency: "MOST_DAYS" },
          { category: "JOINT_PAIN", severity: null, frequency: null },
        ],
      }),
    );
    expect(result.leading?.category).toBe("ANXIETY");
    expect(result.ranked.map((s) => s.category)).toEqual(["ANXIETY", "FATIGUE", "HEADACHE"]);
  });

  it("always offers three clinician questions", () => {
    expect(buildResult(answers({})).questions).toEqual(["sooner", "track", "general"]);
    expect(
      buildResult(answers({ symptoms: [{ category: "FATIGUE", severity: null, frequency: null }] }))
        .questions,
    ).toEqual(["main", "sooner", "track"]);
    expect(
      buildResult(
        answers({
          symptoms: [
            { category: "FATIGUE", severity: null, frequency: null },
            { category: "HEADACHE", severity: null, frequency: null },
          ],
        }),
      ).questions,
    ).toEqual(["main", "together", "sooner"]);
  });

  it("picks the next step from what she wants help with", () => {
    expect(buildResult(answers({ goal: "PREPARE_FOR_APPOINTMENT" })).nextStep).toBe(
      "KEEP_FOR_APPOINTMENT",
    );
    expect(buildResult(answers({ goal: "UNDERSTAND_PATTERNS" })).nextStep).toBe("TRACK_A_WEEK");
    expect(buildResult(answers({ goal: null })).nextStep).toBe("TRACK_A_WEEK");
  });

  it("returns nothing that could read as a score", () => {
    const result = buildResult(
      answers({ symptoms: [{ category: "FATIGUE", severity: "SEVERE", frequency: "MOST_DAYS" }] }),
    );
    expect(Object.keys(result).sort()).toEqual([
      "groups",
      "leading",
      "nextStep",
      "questions",
      "ranked",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });
});

describe("answer storage", () => {
  it("keeps answers in session storage only, never local storage", () => {
    const a = answers({
      goal: "KEEP_RECORD",
      symptoms: [{ category: "FATIGUE", severity: "MILD", frequency: "FEW_DAYS" }],
    });
    saveAnswers(a);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(loadAnswers()).toEqual(a);
  });

  it("clears them", () => {
    saveAnswers(answers({ goal: "KEEP_RECORD" }));
    clearAnswers();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadAnswers()).toEqual(emptyAnswers());
  });

  it("drops stored answers it does not recognise instead of half restoring them", () => {
    for (const bad of [
      "not json",
      JSON.stringify({ version: 2 }),
      JSON.stringify({ ...answers({}), goal: "SOMETHING" }),
      JSON.stringify({
        ...answers({}),
        symptoms: [{ category: "OTHER", severity: null, frequency: null }],
      }),
      JSON.stringify({
        ...answers({}),
        symptoms: [
          { category: "FATIGUE", severity: null, frequency: null },
          { category: "FATIGUE", severity: null, frequency: null },
        ],
      }),
      JSON.stringify({
        ...answers({}),
        symptoms: [{ category: "FATIGUE", severity: "EXTREME", frequency: null }],
      }),
    ]) {
      window.sessionStorage.setItem(STORAGE_KEY, bad);
      expect(loadAnswers()).toEqual(emptyAnswers());
    }
  });
});

describe("first check in copy", () => {
  function keyPaths(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) return [prefix];
    return Object.entries(node).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
  const lookup = (root: unknown, path: string) =>
    path.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], root) as string;

  it.each([
    ["ja", ja],
    ["fr", fr],
  ])("%s has every English key with the same placeholders", (_, messages) => {
    const paths = keyPaths(en.FirstCheckIn);
    expect(keyPaths(messages.FirstCheckIn).sort()).toEqual([...paths].sort());
    for (const path of paths) {
      expect(placeholders(lookup(messages.FirstCheckIn, path)), path).toEqual(
        placeholders(lookup(en.FirstCheckIn, path)),
      );
    }
  });

  it.each([
    ["en", en],
    ["ja", ja],
    ["fr", fr],
  ])("%s never uses dash punctuation or a hyphenated check in", (_, messages) => {
    const text = JSON.stringify(messages.FirstCheckIn);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/check-in/i);
  });

  it("says it is not a diagnosis, in every language", () => {
    expect(en.FirstCheckIn.result.limitsBody).toContain("not a diagnosis");
    expect(ja.FirstCheckIn.result.limitsBody).toContain("診断ではありません");
    expect(fr.FirstCheckIn.result.limitsBody).toContain("pas un diagnostic");
  });
});

describe("baselineRequest: none of these versus skipped", () => {
  const send = (a: Partial<FirstCheckInAnswers>) =>
    baselineRequest(answers(a), "2026-10-29", "UTC", "en");

  it("counts picking symptoms, or choosing none of these, as answering", () => {
    expect(
      send({ symptoms: [{ category: "FATIGUE", severity: null, frequency: null }] })
        .symptomsAnswered,
    ).toBe(true);
    expect(send({ noneOfThese: true })).toMatchObject({ symptoms: [], symptomsAnswered: true });
  });

  it("does not count a skipped question as answered, so empty never means no symptoms", () => {
    const skipped = send({});
    expect(skipped).toMatchObject({ symptoms: [], symptomsAnswered: false });
    expect(saveBaselineCheckInSchema.safeParse(skipped).success).toBe(true);
  });

  it("is refused by the API schema when symptoms are listed but the question is marked unanswered", () => {
    const bad = {
      ...send({ symptoms: [{ category: "FATIGUE", severity: null, frequency: null }] }),
      symptomsAnswered: false,
    };
    expect(saveBaselineCheckInSchema.safeParse(bad).success).toBe(false);
  });

  it("restores answers saved before this field existed, as not chosen", () => {
    const old: Record<string, unknown> = { ...answers({ goal: "KEEP_RECORD" }) };
    delete old.noneOfThese;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    expect(loadAnswers()).toEqual({ ...old, noneOfThese: false });
  });

  it("drops a stored none of these that contradicts picked symptoms", () => {
    saveAnswers(
      answers({
        noneOfThese: true,
        symptoms: [{ category: "FATIGUE", severity: null, frequency: null }],
      }),
    );
    expect(loadAnswers().noneOfThese).toBe(false);
  });
});

describe("baselineRequest", () => {
  it("sends her answers as given, which the API schema accepts as they are", () => {
    const request = baselineRequest(
      answers({
        goal: "KEEP_RECORD",
        sleep: "SEVEN_PLUS_H",
        symptoms: [{ category: "FATIGUE", severity: "MILD", frequency: "FEW_DAYS" }],
      }),
      "2026-10-29",
      "Europe/Paris",
      "fr",
    );
    expect(request).toEqual({
      completedOn: "2026-10-29",
      timeZone: "Europe/Paris",
      locale: "fr",
      goal: "KEEP_RECORD",
      sleepDuration: "SEVEN_PLUS_H",
      workImpact: null,
      symptomsAnswered: true,
      symptoms: [{ category: "FATIGUE", severity: "MILD", frequency: "FEW_DAYS" }],
    });
    expect(saveBaselineCheckInSchema.parse(request)).toEqual(request);
  });

  it("carries nothing beyond the answers: no step, version or extra field", () => {
    const keys = Object.keys(baselineRequest(answers({}), "2026-10-29", "UTC", "en")).sort();
    expect(keys).toEqual([
      "completedOn",
      "goal",
      "locale",
      "sleepDuration",
      "symptoms",
      "symptomsAnswered",
      "timeZone",
      "workImpact",
    ]);
  });
});
