import { describe, expect, it } from "vitest";
import {
  assertSafeTarget,
  checkInWrites,
  periodStartDates,
  validatePlan,
  type DemoHistoryPlan,
} from "../src/scripts/seed-demo-history.js";
import { checkInDateStatus } from "../src/modules/symptoms/symptom-check-in.js";
// The generator the website's maya.html also uses.
import {
  buildMayaRecord,
  historyPlan,
  shiftToToday,
  summarise,
} from "../../../scripts/seed-demo.mjs";

const NOW = new Date("2026-10-25T03:00:00Z");

describe("demo history safety guard", () => {
  it("refuses production", () => {
    expect(() =>
      assertSafeTarget({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@localhost/db" }),
    ).toThrow(/production/);
  });

  it("refuses a remote database unless that exact host is confirmed", () => {
    const url = "postgresql://u:p@db.staging.example:5432/embr";
    expect(() => assertSafeTarget({ DATABASE_URL: url })).toThrow(/DEMO_CONFIRM_DB_HOST/);
    expect(() =>
      assertSafeTarget({ DATABASE_URL: url, DEMO_CONFIRM_DB_HOST: "db.other.example" }),
    ).toThrow(/refusing/);
    expect(
      assertSafeTarget({ DATABASE_URL: url, DEMO_CONFIRM_DB_HOST: "db.staging.example" }),
    ).toBe("db.staging.example");
  });

  it("allows a local database and requires a URL", () => {
    expect(assertSafeTarget({ DATABASE_URL: "postgresql://u:p@localhost:5432/embr" })).toBe(
      "localhost",
    );
    expect(() => assertSafeTarget({})).toThrow(/DATABASE_URL/);
  });
});

describe("demo history plan", () => {
  const plan = historyPlan(
    buildMayaRecord(),
    "maya.demo@embr.test",
    "Asia/Tokyo",
  ) as DemoHistoryPlan;

  it("carries every recorded day and period start from Maya's record, and nothing else", () => {
    const summary = summarise(buildMayaRecord());
    const withSymptoms = plan.days.filter((d) => d.entries.length > 0);
    expect(withSymptoms.length).toBeLessThanOrEqual(summary.loggedDays);
    expect(plan.days.filter((d) => d.periodStart).map((d) => d.date)).toEqual(summary.periodStarts);
    const hot = plan.days.filter((d) => d.entries.some((e) => e.category === "HOT_FLASH")).length;
    expect(hot).toBe(summary.perSymptom.HOT);
    expect(plan.days[plan.days.length - 1]!.date).toBe("2026-09-30");
  });

  it("is a valid plan with no future dates", () => {
    expect(() => validatePlan(plan, NOW)).not.toThrow();
  });

  it("times each check in at local noon of its own date", () => {
    const first = checkInWrites(plan)[0]!;
    const tokyo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
    }).format(first.occurredAt);
    expect(tokyo).toBe(`${first.checkInDate.toISOString().slice(0, 10)}, 12:00`);
  });

  it("writes period starts as date columns", () => {
    const { periodStarts } = summarise(buildMayaRecord());
    expect(periodStartDates(plan).map((d) => d.toISOString())).toEqual(
      periodStarts.map((d: string) => `${d}T00:00:00.000Z`),
    );
  });

  it("can end today, keeping the record's shape", () => {
    const shifted = shiftToToday(plan, NOW) as DemoHistoryPlan;
    expect(shifted.days.at(-1)!.date).toBe("2026-10-25");
    expect(shifted.days).toHaveLength(plan.days.length);
    expect(() => validatePlan(shifted, NOW)).not.toThrow();
  });

  it("rejects future dates, duplicate dates and duplicate symptoms", () => {
    const day = { date: "2026-10-26", entries: [], periodStart: false };
    expect(() => validatePlan({ ...plan, days: [day] }, NOW)).toThrow(/future/);
    const d = { date: "2026-10-01", entries: [], periodStart: false };
    expect(() => validatePlan({ ...plan, days: [d, d] }, NOW)).toThrow(/duplicate date/);
    const dup = {
      date: "2026-10-01",
      entries: [
        { category: "FATIGUE" as const, severity: "MILD" as const },
        { category: "FATIGUE" as const, severity: "SEVERE" as const },
      ],
      periodStart: false,
    };
    expect(() => validatePlan({ ...plan, days: [dup] }, NOW)).toThrow(/duplicate symptom/);
  });
});

describe("the API's date rule is unchanged", () => {
  it("still refuses a check in older than yesterday", () => {
    expect(checkInDateStatus("2026-10-23", "Asia/Tokyo", NOW)).toBe("too_old");
    expect(checkInDateStatus("2026-10-24", "Asia/Tokyo", NOW)).toBe("ok");
  });
});
