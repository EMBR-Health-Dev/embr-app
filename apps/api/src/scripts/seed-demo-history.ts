/**
 * Development and staging only: writes the synthetic demo account's
 * past daily check ins and period starts.
 *
 * The production API only accepts a check in for today or yesterday
 * (CHECK_IN_EDITABLE_DAYS), and that rule stays as it is. A demo record
 * needs weeks of history, so scripts/seed-demo.mjs registers the account
 * and records consent through the real API, then hands the history to
 * this script, which writes it with the same repository functions the
 * API uses (same upsert, same unique keys, same field encryption). Only
 * the service level date window is skipped, and only here.
 *
 *   DATABASE_URL=... pnpm --filter @embr/api exec tsx src/scripts/seed-demo-history.ts < plan.json
 *
 * Normally run by scripts/seed-demo.mjs, not by hand. The plan on stdin
 * is { email, timeZone, days: [{ date, entries, periodStart }] }.
 *
 * Safety:
 * - Refuses NODE_ENV=production.
 * - Refuses a database host other than localhost unless
 *   DEMO_CONFIRM_DB_HOST names that exact host, typed by a person.
 * - Only writes to an account that already exists with the given email,
 *   and refuses dates in the future.
 * Output is counts only: no health data is printed.
 */
import type { SaveSymptomCheckInInput } from "@embr/validation";
import { localDate } from "../modules/trends/symptom-history.js";
import { localNoon, toDateColumn } from "../modules/symptoms/symptom-check-in.js";

export interface DemoHistoryDay {
  date: string;
  entries: SaveSymptomCheckInInput["entries"];
  periodStart: boolean;
}

export interface DemoHistoryPlan {
  email: string;
  timeZone: string;
  days: DemoHistoryDay[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws unless this process may write synthetic data to `databaseUrl`. */
export function assertSafeTarget(env: {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DEMO_CONFIRM_DB_HOST?: string;
}): string {
  if (env.NODE_ENV === "production") {
    throw new Error("refusing to seed demo data with NODE_ENV=production");
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  let host: string;
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal && env.DEMO_CONFIRM_DB_HOST !== host) {
    throw new Error(
      `refusing to seed database host ${host}. If this is a staging or demo database you ` +
        `control, set DEMO_CONFIRM_DB_HOST=${host}. Never run this against production.`,
    );
  }
  return host;
}

/** Throws unless the plan is well formed and has no future dates. */
export function validatePlan(plan: DemoHistoryPlan, now: Date = new Date()): void {
  if (!plan || typeof plan.email !== "string" || !plan.email) throw new Error("plan.email missing");
  if (typeof plan.timeZone !== "string" || !plan.timeZone) throw new Error("plan.timeZone missing");
  if (!Array.isArray(plan.days)) throw new Error("plan.days missing");
  const today = localDate(now, plan.timeZone);
  const seen = new Set<string>();
  for (const day of plan.days) {
    if (!ISO_DATE.test(day.date)) throw new Error(`invalid date: ${day.date}`);
    if (day.date > today) throw new Error(`future date in plan: ${day.date}`);
    if (seen.has(day.date)) throw new Error(`duplicate date in plan: ${day.date}`);
    seen.add(day.date);
    const categories = new Set(day.entries.map((e) => e.category));
    if (categories.size !== day.entries.length) throw new Error(`duplicate symptom on ${day.date}`);
  }
}

/**
 * Where each check in's symptoms are timed: local noon of that date,
 * the same instant the API uses for a check in saved for an earlier
 * day, so every view that groups by local day puts it on that day.
 */
export function checkInWrites(plan: DemoHistoryPlan) {
  return plan.days
    .filter((d) => d.entries.length > 0)
    .map((d) => ({
      checkInDate: toDateColumn(d.date),
      entries: d.entries,
      occurredAt: localNoon(d.date, plan.timeZone),
    }));
}

export function periodStartDates(plan: DemoHistoryPlan): Date[] {
  return plan.days.filter((d) => d.periodStart).map((d) => toDateColumn(d.date));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const host = assertSafeTarget(process.env);
  const plan = JSON.parse(await readStdin()) as DemoHistoryPlan;
  validatePlan(plan);

  // Imported only after the target is confirmed safe, so nothing
  // connects to a database the guard above would refuse.
  const { prisma } = await import("../lib/prisma.js");
  const { symptomRepository } = await import("../modules/symptoms/symptom.repository.js");
  const { cycleRepository } = await import("../modules/cycle/cycle.repository.js");
  try {
    const user = await prisma.user.findUnique({
      where: { email: plan.email },
      select: { id: true },
    });
    if (!user)
      throw new Error("the demo account does not exist; register it through the API first");

    const writes = checkInWrites(plan);
    for (const w of writes) {
      await symptomRepository.saveCheckIn(user.id, w.checkInDate, w.entries, w.occurredAt);
    }
    const periods = periodStartDates(plan);
    for (const date of periods) {
      await cycleRepository.upsertByDate(user.id, {
        date,
        isPeriodStart: true,
        isPeriodEnd: false,
      });
    }
    console.log(
      `seed-demo-history: ${writes.length} daily check ins and ${periods.length} period starts written on ${host}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    // The message only: a database error can quote values from its query.
    console.error(`seed-demo-history: ${err instanceof Error ? err.message : "failed"}`);
    process.exit(1);
  });
}
