#!/usr/bin/env node
// Seeds ONE clearly synthetic demo account ("Maya") into a running EMBR API.
//
// Maya is fictional and her record is synthetic. The record below is the same
// deterministic generator the website's maya.html uses (fixed seed 20260930,
// 63 days ending 30 September 2026), so the app and the site tell the same
// story. Run with --dry-run to print the summary figures and compare them to
// maya.html without touching any server.
//
// Register and consent go through the real API, so the consent gate and audit
// logging are exercised exactly as for a real person. The history itself
// cannot: the API only accepts a check in for today or yesterday, and that
// rule must not be loosened for a demo. So the past days are written by
// apps/api/src/scripts/seed-demo-history.ts, which uses the API's own
// repository functions (same upsert, same unique keys, same encryption)
// directly against the database. Re-running is safe: a daily check in
// replaces that date, and a cycle entry is create-or-replace by date.
//
// SAFETY. This must never write synthetic data into the production database.
// - DEMO_API_URL has no default and must be set explicitly.
// - Any host other than localhost needs DEMO_CONFIRM_HOST set to that exact
//   host name, typed by a person, as a second deliberate step.
// - DEMO_PASSWORD has no default, so no credential is committed.
// - The history writer refuses NODE_ENV=production and any database host other
//   than localhost unless DEMO_CONFIRM_DB_HOST names it.
//
// Usage (local compose stack, mailhog catches the verification email):
//   pnpm --filter "@embr/validation" build
//   DEMO_API_URL=http://localhost:4000 DEMO_PASSWORD='Choose-A-Long-Pass-1' \
//   DATABASE_URL=postgresql://embr:embr_dev_password@localhost:5432/embr_dev \
//     node scripts/seed-demo.mjs
//
// Staging:
//   DEMO_API_URL=https://staging-api.example DEMO_CONFIRM_HOST=staging-api.example \
//   DEMO_EMAIL=maya.demo@your-inbox.example DEMO_PASSWORD='...' \
//   DATABASE_URL=... DEMO_CONFIRM_DB_HOST=<staging db host> node scripts/seed-demo.mjs
//
// Flags:
//   --dry-run   Print the record summary only. No network calls.
//   --end-today Shift the 63 days so the last one is today (in DEMO_TIME_ZONE),
//               so the dashboard week and recent views have data. The default
//               keeps the fixed dates that match maya.html.
//   --brief     After seeding, try to generate the EMBR BRIEF. This needs the
//               demo email to be verified first (the API enforces it).

import process from "node:process";
import { spawnSync } from "node:child_process";

// ---- Maya's record: identical logic to maya.html -------------------------------

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 63;
const END = new Date(Date.UTC(2026, 8, 30)); // 30 September 2026
const PERIOD_STARTS = [4, 33, 61];

// id as used on the website -> EMBR SymptomCategory
const SYMPTOMS = [
  { id: "SLEEP", category: "SLEEP_DISTURBANCE", base: 0.32, drift: 0.28 },
  { id: "HOT", category: "HOT_FLASH", base: 0.3, drift: 0.18 },
  { id: "SWEATS", category: "NIGHT_SWEATS", base: 0.12, drift: 0.14 },
  { id: "FOG", category: "BRAIN_FOG", base: 0.16, drift: 0.12 },
  { id: "FATIGUE", category: "FATIGUE", base: 0.2, drift: 0.08 },
  { id: "MOOD", category: "MOOD_CHANGE", base: 0.12, drift: 0.04 },
];
const sev = (r) => (r < 0.5 ? "MILD" : r < 0.85 ? "MODERATE" : "SEVERE");

export function buildMayaRecord() {
  const rand = mulberry32(20260930);
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const logged = rand() < 0.86; // some days have no entry at all
    const t = i / (DAYS - 1);
    const rec = {};
    if (logged) {
      for (const s of SYMPTOMS) {
        let p = s.base + s.drift * t;
        if (s.id === "SWEATS" && rec.HOT) p += 0.2;
        if (s.id === "SLEEP" && rec.HOT) p += 0.18;
        if ((s.id === "FOG" || s.id === "FATIGUE") && rec.SLEEP) p += 0.2;
        if (rand() < p) rec[s.id] = sev(rand());
      }
    }
    const date = new Date(END.getTime() - (DAYS - 1 - i) * 86400000);
    days.push({
      index: i,
      date: date.toISOString().slice(0, 10),
      logged,
      rec,
      period: PERIOD_STARTS.includes(i),
    });
  }
  return days;
}

export function summarise(days) {
  const loggedDays = days.filter((d) => d.logged).length;
  const count = (id) => days.filter((d) => d.rec[id]).length;
  const recorded = days.filter((d) => d.logged);
  const withSleep = recorded.filter((d) => d.rec.SLEEP);
  return {
    days: days.length,
    from: days[0].date,
    to: days[days.length - 1].date,
    loggedDays,
    noEntryDays: days.length - loggedDays,
    perSymptom: Object.fromEntries(SYMPTOMS.map((s) => [s.id, count(s.id)])),
    hotAndSleepSameDay: days.filter((d) => d.rec.HOT && d.rec.SLEEP).length,
    hotOrSleepDays: days.filter((d) => d.rec.HOT || d.rec.SLEEP).length,
    fatigueOnSleepDays: withSleep.filter((d) => d.rec.FATIGUE).length,
    sleepDays: withSleep.length,
    periodStarts: days.filter((d) => d.period).map((d) => d.date),
  };
}

/** What seed-demo-history.ts writes: one entry per recorded day. */
export function historyPlan(days, email, timeZone) {
  return {
    email,
    timeZone,
    days: days
      .filter((d) => d.logged || d.period)
      .map((d) => ({
        date: d.date,
        entries: SYMPTOMS.filter((s) => d.rec[s.id]).map((s) => ({
          category: s.category,
          severity: d.rec[s.id],
        })),
        periodStart: d.period,
      })),
  };
}

/** The same plan, moved so its last day is today in its time zone. */
export function shiftToToday(plan, now = new Date()) {
  if (plan.days.length === 0) return plan;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: plan.timeZone }).format(now);
  const last = plan.days[plan.days.length - 1].date;
  const shiftMs = Date.parse(today) - Date.parse(last);
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      date: new Date(Date.parse(d.date) + shiftMs).toISOString().slice(0, 10),
    })),
  };
}

// ---- API driver ------------------------------------------------------------------

function fail(message) {
  console.error(`seed-demo: ${message}`);
  process.exit(1);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const days = buildMayaRecord();

  if (args.has("--dry-run")) {
    console.log(JSON.stringify(summarise(days), null, 2));
    return;
  }

  const apiUrl = process.env.DEMO_API_URL;
  if (!apiUrl) fail("DEMO_API_URL is required (no default, by design).");
  let host;
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    fail(`DEMO_API_URL is not a valid URL: ${apiUrl}`);
  }
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal && process.env.DEMO_CONFIRM_HOST !== host) {
    fail(
      `refusing to seed ${host}. This writes synthetic data. If this is a staging or demo ` +
        `environment you control, set DEMO_CONFIRM_HOST=${host} to confirm. Never run it against production.`,
    );
  }
  // Same rule seed-demo-history.ts enforces, checked here first so a refused
  // run writes nothing at all, not even the account.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is required to write the demo history.");
  if (process.env.NODE_ENV === "production") fail("refusing to seed with NODE_ENV=production.");
  let dbHost;
  try {
    dbHost = new URL(databaseUrl).hostname;
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }
  const dbIsLocal = ["localhost", "127.0.0.1", "::1"].includes(dbHost);
  if (!dbIsLocal && process.env.DEMO_CONFIRM_DB_HOST !== dbHost) {
    fail(
      `refusing to seed database host ${dbHost}. If this is a staging or demo database you ` +
        `control, set DEMO_CONFIRM_DB_HOST=${dbHost}. Never run it against production.`,
    );
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password) fail("DEMO_PASSWORD is required (12+ chars, upper, lower, digit).");
  const email = (process.env.DEMO_EMAIL ?? (isLocal ? "maya.demo@embr.test" : "")).trim();
  if (!email) fail("DEMO_EMAIL is required for a non-local host.");

  let LEGAL_DOCUMENT_VERSIONS;
  try {
    ({ LEGAL_DOCUMENT_VERSIONS } = await import("../packages/validation/dist/index.js"));
  } catch {
    fail('build the validation package first: pnpm --filter "@embr/validation" build');
  }

  const base = apiUrl.replace(/\/$/, "");
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json, text };
  };

  const consents = Object.entries(LEGAL_DOCUMENT_VERSIONS).map(([type, version]) => ({
    type,
    version,
  }));

  console.log(`Seeding Maya on ${host} as ${email}`);

  // 1. Register (409 when she already exists, which is fine on a re-run).
  const reg = await call("POST", "/auth/register", {
    body: { email, password, consents, locale: "en", client: "web" },
  });
  if (reg.status === 201) console.log("  registered");
  else if (reg.status === 409) console.log("  account already exists, reusing it");
  else if (reg.status === 403 || reg.json?.error?.code === "REGISTRATION_CLOSED")
    fail(
      "registration is closed on this API (PUBLIC_REGISTRATION_ENABLED=false). Enable it on the demo environment only.",
    );
  else fail(`register failed: ${reg.status} ${reg.text.slice(0, 300)}`);

  // 2. Log in. Non-browser clients get the access token in the body, so no
  //    cookie jar or CSRF token is needed.
  const login = await call("POST", "/auth/login", { body: { email, password } });
  if (login.status !== 200) fail(`login failed: ${login.status} ${login.text.slice(0, 300)}`);
  const token = login.json?.data?.accessToken;
  if (!token) fail("login response had no accessToken");

  // 3. Make sure consent is current (covers a re-run after a version bump).
  const grant = await call("POST", "/consents", {
    token,
    body: { consents, locale: "en", client: "web" },
  });
  if (grant.status !== 200) fail(`consent failed: ${grant.status} ${grant.text.slice(0, 300)}`);
  console.log("  consent current");

  // 4. History: daily check ins and period starts, written by the API's
  //    own repository code (see the header for why not through the API).
  const timeZone = process.env.DEMO_TIME_ZONE ?? "Asia/Tokyo";
  let plan = historyPlan(days, email, timeZone);
  if (args.has("--end-today")) plan = shiftToToday(plan);
  const writer = spawnSync(
    "pnpm",
    ["--filter", "@embr/api", "exec", "tsx", "src/scripts/seed-demo-history.ts"],
    { input: JSON.stringify(plan), stdio: ["pipe", "inherit", "inherit"], env: process.env },
  );
  if (writer.status !== 0) fail("writing the demo history failed (see the message above).");

  // 6. Optional BRIEF. The API requires a verified email address.
  if (args.has("--brief")) {
    const r = await call("POST", "/briefs", {
      token,
      body: { fromDate: plan.days[0].date, toDate: plan.days[plan.days.length - 1].date },
    });
    if (r.status === 201) console.log(`  BRIEF generated (id ${r.json?.data?.id ?? "unknown"})`);
    else
      console.log(
        `  BRIEF not generated (${r.status}). If the email is unverified, open the verification ` +
          `email (mailhog on local) and re-run with --brief.`,
      );
  }

  console.log("Done. Sign in as the demo account and open the Timeline and BRIEF.");
}

// Only run the driver when executed directly, so the generator can be imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
}
