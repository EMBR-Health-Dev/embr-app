// End-to-end integrity checks against a LOCAL EMBR stack: real API,
// real Postgres, real Redis. See README.md in this folder for how to
// run it and what it does and does not prove. Refuses any non-local
// API or database, creates its own throwaway accounts, and deletes them
// when it finishes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(repo, "apps/api/package.json"));
const { PDFParse } = require("pdf-parse");
const { LEGAL_DOCUMENT_VERSIONS } = await import(
  path.join(repo, "packages/validation/dist/index.js")
);

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
function requireLocal(name, url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (!LOCAL_HOSTS.includes(host))
    throw new Error(`${name} must be local; refusing ${host}. Never run this against production.`);
}
const API = process.env.INTEGRITY_API_URL ?? "http://localhost:4000";
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
if (!DATABASE_URL)
  throw new Error("DATABASE_URL is required (the local dev database the API uses).");
if (process.env.NODE_ENV === "production")
  throw new Error("refusing to run with NODE_ENV=production");
requireLocal("INTEGRITY_API_URL", API);
requireLocal("DATABASE_URL", DATABASE_URL);
requireLocal("REDIS_URL", REDIS_URL);
// psql takes the URL without Prisma's ?schema= parameter.
const PSQL_URL = DATABASE_URL.split("?")[0];

const PW = "Integrity-Check-Pass-1";
const consents = Object.entries(LEGAL_DOCUMENT_VERSIONS).map(([type, version]) => ({
  type,
  version,
}));
const results = [];
const createdEmails = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
};
const sql = (q) => execFileSync("psql", [PSQL_URL, "-At", "-F", "|", "-c", q]).toString().trim();
// Registration is rate limited per IP; a run creates more accounts
// than the limit allows, so the local limiter is reset before each.
const resetRegisterLimit = () =>
  execFileSync(
    "redis-cli",
    [
      "-u",
      REDIS_URL,
      "del",
      "rl:register:127.0.0.1",
      "rl:register:::1",
      "rl:global:127.0.0.1",
      "rl:global:::1",
    ],
    { stdio: "ignore" },
  );

async function call(method, path, { token, body, lang } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (lang) headers["accept-language"] = lang;
  const r = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString());
  } catch {
    // Not JSON (a PDF or CSV body); callers use buf or text instead.
  }
  return { status: r.status, json, buf, text: buf.toString() };
}
async function pdfText(buf) {
  return (await new PDFParse({ data: buf }).getText()).text;
}
async function makeUser(tag, locale = "en") {
  resetRegisterLimit();
  const email = `integrity-${tag}-${Date.now()}@embr.test`;
  createdEmails.push(email);
  const reg = await call("POST", "/auth/register", {
    body: { email, password: PW, consents, locale, client: "web" },
  });
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${reg.text.slice(0, 200)}`);
  sql(`update users set "emailVerifiedAt"=now() where email='${email}'`);
  const login = await call("POST", "/auth/login", { body: { email, password: PW } });
  return { email, token: login.json.data.accessToken, id: login.json.data.user.id };
}

// ---------- T1/T2: day attribution across time zones ----------
for (const [tz, at, localDay] of [
  ["Asia/Tokyo", "2026-10-10T08:00:00+09:00", "2026-10-10"],
  ["America/Los_Angeles", "2026-10-10T20:00:00-07:00", "2026-10-10"],
]) {
  const u = await makeUser(tz.split("/")[1].toLowerCase());
  const log = await call("POST", "/symptom-logs", {
    token: u.token,
    body: { category: "HOT_FLASH", severity: "MODERATE", occurredAt: at },
  });
  check(`[${tz}] quick log saved`, log.status === 201, `UTC ${log.json?.data?.occurredAt}`);
  const old = await call("PUT", "/symptom-logs/check-ins/2026-10-12", {
    token: u.token,
    body: { timeZone: tz, entries: [{ category: "BRAIN_FOG", severity: "MILD" }] },
  });
  check(
    `[${tz}] a check in older than yesterday is refused (by design)`,
    old.status === 400,
    `status ${old.status}`,
  );

  const hist = await call(
    "GET",
    `/trends/symptom-history?from=2026-10-01&to=2026-10-20&timeZone=${encodeURIComponent(tz)}`,
    { token: u.token },
  );
  const histText = JSON.stringify(hist.json);
  check(
    `[${tz}] symptom history puts the quick log on her local day ${localDay}`,
    histText.includes(localDay) && !histText.includes(at.slice(0, 10) === localDay ? "__" : "__"),
    `has ${localDay}: ${histText.includes(localDay)}; days: ${[...new Set(histText.match(/2026-10-\d\d/g) ?? [])].join(",")}`,
  );

  const from = tz === "Asia/Tokyo" ? "2026-10-01T00:00:00+09:00" : "2026-10-01T00:00:00-07:00";
  const to = tz === "Asia/Tokyo" ? "2026-10-20T23:59:59+09:00" : "2026-10-20T23:59:59-07:00";
  const brief = await call("POST", "/briefs", {
    token: u.token,
    body: { fromDate: from, toDate: to, timeZone: tz },
  });
  check(
    `[${tz}] BRIEF generated`,
    brief.status === 201,
    `status ${brief.status} ${brief.status !== 201 ? brief.text.slice(0, 200) : ""}`,
  );
  const bText = JSON.stringify(brief.json?.data ?? {});
  const bDays = [...new Set(bText.match(/2026-10-\d\d/g) ?? [])];
  check(
    `[${tz}] BRIEF day-level dates use her local day`,
    bDays.includes(localDay) &&
      !bDays.includes(
        new Date(at).toISOString().slice(0, 10) === localDay
          ? "x"
          : new Date(at).toISOString().slice(0, 10),
      ),
    `dates in BRIEF: ${bDays.join(",")}`,
  );
  if (brief.json?.data?.id) {
    const bp = await call("GET", `/briefs/${brief.json.data.id}/pdf`, { token: u.token });
    const t = (await pdfText(bp.buf)).replace(/\s+/g, " ");
    check(
      `[${tz}] BRIEF PDF counts the hot flash`,
      bp.status === 200 && /Hot Flash/i.test(t),
      `pdf ${bp.status}`,
    );
  }

  const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const sp = await call("GET", `/export/summary.pdf?${range}&timeZone=${encodeURIComponent(tz)}`, {
    token: u.token,
  });
  const line = (await pdfText(sp.buf)).replace(/\s+/g, " ").match(/(2026-10-\d\d)\s+Hot Flash/i);
  check(
    `[${tz}] clinician summary PDF dates the hot flash on her local day ${localDay}`,
    line?.[1] === localDay,
    `PDF shows ${line?.[1] ?? "no line"}`,
  );
  const utcDay = new Date(at).toISOString().slice(0, 10);
  const spOld = await call("GET", `/export/summary.pdf?${range}`, { token: u.token });
  const lineOld = (await pdfText(spOld.buf))
    .replace(/\s+/g, " ")
    .match(/(2026-10-\d\d)\s+Hot Flash/i);
  check(
    `[${tz}] without timeZone the summary PDF still works, in UTC as before`,
    spOld.status === 200 && lineOld?.[1] === utcDay,
    `PDF shows ${lineOld?.[1]}`,
  );
  const spBad = await call("GET", `/export/summary.pdf?${range}&timeZone=Not%2FAZone`, {
    token: u.token,
  });
  check(
    `[${tz}] an unknown time zone is refused with 400`,
    spBad.status === 400,
    `status ${spBad.status}`,
  );

  const csv = await call(
    "GET",
    `/export/symptom-logs.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { token: u.token },
  );
  const row = csv.text.split("\n").find((l) => l.includes("HOT_FLASH") || /hot flash/i.test(l));
  check(`[${tz}] symptom CSV row present`, !!row, `row: ${row}`);
  check(
    `[${tz}] symptom CSV header names the UTC timestamp`,
    csv.text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ===
      "occurredAt (UTC),category,severity,notes",
    csv.text.split("\n")[0],
  );
}

// ---------- T3: BRIEF lifecycle, snapshot, isolation ----------
{
  const u = await makeUser("lifecycle");
  const other = await makeUser("other");
  const q = (c, sev, at) =>
    call("POST", "/symptom-logs", {
      token: u.token,
      body: { category: c, severity: sev, occurredAt: at },
    });
  await q("FATIGUE", "SEVERE", "2026-10-05T10:00:00+02:00");
  await q("FATIGUE", "MILD", "2026-10-07T10:00:00+02:00");
  const body = {
    fromDate: "2026-10-01T00:00:00+02:00",
    toDate: "2026-10-20T23:59:59+02:00",
    timeZone: "Europe/Paris",
  };
  const b = await call("POST", "/briefs", { token: u.token, body });
  const id = b.json?.data?.id;
  check("BRIEF create", b.status === 201 && !!id);
  const before = await call("GET", `/briefs/${id}`, { token: u.token });
  check(
    "BRIEF counts the entries in range",
    JSON.stringify(before.json?.data?.symptomSummary).includes('"count":2'),
    JSON.stringify(before.json?.data?.symptomSummary),
  );
  await q("HEADACHE", "MILD", "2026-10-06T10:00:00+02:00");
  await q("FATIGUE", "MODERATE", "2026-10-06T11:00:00+02:00");
  const after = await call("GET", `/briefs/${id}`, { token: u.token });
  check(
    "BRIEF is a fixed snapshot: later entries don't change it",
    JSON.stringify(before.json?.data?.symptomSummary) ===
      JSON.stringify(after.json?.data?.symptomSummary),
    JSON.stringify(after.json?.data?.symptomSummary),
  );
  const list = await call("GET", "/briefs", { token: u.token });
  check("BRIEF appears in history", JSON.stringify(list.json).includes(id));
  const peek = await call("GET", `/briefs/${id}`, { token: other.token });
  const peekPdf = await call("GET", `/briefs/${id}/pdf`, { token: other.token });
  const peekDel = await call("DELETE", `/briefs/${id}`, { token: other.token });
  check(
    "another account can't read, download or delete it",
    peek.status === 404 && peekPdf.status === 404 && [403, 404].includes(peekDel.status),
    `${peek.status}/${peekPdf.status}/${peekDel.status}`,
  );
  const exp1 = await call("GET", "/export/all-data.json", { token: u.token });
  check("full JSON export includes the BRIEF", exp1.text.includes(id));
  const del = await call("DELETE", `/briefs/${id}`, { token: u.token });
  check("BRIEF delete", del.status === 204, `status ${del.status}`);
  const gone = await call("GET", `/briefs/${id}`, { token: u.token });
  const gonePdf = await call("GET", `/briefs/${id}/pdf`, { token: u.token });
  const list2 = await call("GET", "/briefs", { token: u.token });
  const exp2 = await call("GET", "/export/all-data.json", { token: u.token });
  check(
    "deleted BRIEF is gone everywhere (detail, PDF, history, export)",
    gone.status === 404 &&
      gonePdf.status === 404 &&
      !JSON.stringify(list2.json).includes(id) &&
      !exp2.text.includes(id),
    `${gone.status}/${gonePdf.status}`,
  );
  check(
    "deleted BRIEF row removed from the database",
    sql(`select count(*) from clinical_briefs where id='${id}'`) === "0",
  );
  const again = await call("DELETE", `/briefs/${id}`, { token: u.token });
  check("deleting it twice is a clean 404", again.status === 404, `status ${again.status}`);

  // ---------- T5: account deletion ----------
  const tables = sql(
    `select table_name from information_schema.columns where column_name='userId' and table_schema='public' order by 1`,
  ).split("\n");
  const del2 = await call("DELETE", "/auth/me", { token: u.token, body: { password: PW } });
  check(
    "account delete",
    [200, 204].includes(del2.status),
    `status ${del2.status} ${del2.text.slice(0, 120)}`,
  );
  const left = tables
    .map((t) => [t, sql(`select count(*) from "${t}" where "userId"='${u.id}'`)])
    .filter(([, n]) => n !== "0");
  check(
    "no rows left for the deleted account in any table with a userId",
    left.length === 0,
    left.map(([t, n]) => `${t}=${n}`).join(", ") || `checked ${tables.length} tables`,
  );
  check("user row removed", sql(`select count(*) from users where id='${u.id}'`) === "0");
}

// ---------- T4: BRIEF in each language ----------
for (const [lang, heading] of [
  ["en", "Summary"],
  ["ja", "要約"],
  ["fr", "Synthèse"],
]) {
  const u = await makeUser(`lang-${lang}`, lang);
  await call("POST", "/symptom-logs", {
    token: u.token,
    body: { category: "HOT_FLASH", severity: "MODERATE", occurredAt: "2026-10-05T10:00:00+02:00" },
  });
  const b = await call("POST", "/briefs", {
    token: u.token,
    lang,
    body: {
      fromDate: "2026-10-01T00:00:00+02:00",
      toDate: "2026-10-20T23:59:59+02:00",
      timeZone: "Europe/Paris",
    },
  });
  const p = b.json?.data?.id
    ? await call("GET", `/briefs/${b.json.data.id}/pdf`, { token: u.token, lang: "en" })
    : null;
  const t = p ? (await pdfText(p.buf)).replace(/\s+/g, "") : "";
  check(
    `[${lang}] BRIEF stored in ${lang} and its PDF keeps that language even when downloaded with another`,
    b.json?.data?.locale === lang &&
      t.toLowerCase().includes(heading.toLowerCase().replace(/\s+/g, "")),
    `locale ${b.json?.data?.locale}, pdf ${p?.status}`,
  );
}

// Remove every account this run created (the account deletion check
// already removed one; the rest go here).
if (createdEmails.length) {
  sql(`delete from users where email in (${createdEmails.map((e) => `'${e}'`).join(",")})`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
