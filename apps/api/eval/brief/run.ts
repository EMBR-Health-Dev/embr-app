/**
 * BRIEF evaluation harness.
 *
 *   Replay (default, offline, deterministic, runs in CI):
 *     pnpm --filter @embr/api eval:brief
 *   Live (calls the real model with the 15 fictional records; needs
 *   ANTHROPIC_API_KEY; costs money; run by a person, never in CI):
 *     pnpm --filter @embr/api eval:brief -- --live
 *
 * Replay writes eval/brief/reports/replay.md and .json, byte-identical
 * on every run. Live writes reports/live-<timestamp>.md and .json,
 * including the fictional responses for human and clinician review.
 */
import "./eval-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_RECORDS } from "./records.js";
import { prepareRecord, type PreparedRecord } from "./pipeline.js";
import { EVAL_LIMITS, evaluateOutput, type CheckResult, type ModelOutput } from "./checks.js";
import { EXPECTED_FAILURE, syntheticOutput, type Variant } from "./synthetic.js";

export interface CaseResult {
  recordId: string;
  locale: string;
  variant: Variant | "live";
  checks: CheckResult[];
  /** Replay: did the checks catch exactly what this variant breaks? */
  asExpected: boolean;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Live only, for review. Fictional input, so no real health data. */
  responseText?: string;
}

const VARIANTS = Object.keys(EXPECTED_FAILURE) as Variant[];

export function runReplay(): CaseResult[] {
  const results: CaseResult[] = [];
  for (const record of EVAL_RECORDS) {
    const prepared = prepareRecord(record);
    for (const variant of VARIANTS) {
      const checks = evaluateOutput(prepared, syntheticOutput(prepared, variant));
      const expected = EXPECTED_FAILURE[variant];
      const failed = checks.filter((c) => !c.passed).map((c) => c.name);
      const asExpected = expected === null ? failed.length === 0 : failed.includes(expected);
      results.push({
        recordId: record.id,
        locale: record.locale,
        variant,
        checks,
        asExpected,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
      });
    }
  }
  return results;
}

async function callModel(prepared: PreparedRecord): Promise<ModelOutput> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { buildBriefRequest } = await import("../../src/modules/briefs/brief.ai.js");
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  const started = Date.now();
  const message = await client.messages.create(
    buildBriefRequest(prepared.aiInput, prepared.record.locale),
  );
  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    stopReason: message.stop_reason ?? null,
    latencyMs: Date.now() - started,
    inputTokens: message.usage?.input_tokens ?? null,
    outputTokens: message.usage?.output_tokens ?? null,
  };
}

export async function runLive(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const record of EVAL_RECORDS) {
    const prepared = prepareRecord(record);
    const output = await callModel(prepared);
    const checks = evaluateOutput(prepared, output);
    const slow = output.latencyMs !== null && output.latencyMs > EVAL_LIMITS.latencyBudgetMs;
    results.push({
      recordId: record.id,
      locale: record.locale,
      variant: "live",
      checks,
      asExpected: checks.every((c) => c.passed) && !slow,
      latencyMs: output.latencyMs,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      responseText: output.text,
    });
  }
  return results;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function renderMarkdown(results: CaseResult[], mode: "replay" | "live"): string {
  const passed = results.filter((r) => r.asExpected).length;
  const lines = [
    `# BRIEF evaluation: ${mode}`,
    "",
    mode === "replay"
      ? "Offline replay of SYNTHETIC responses written by the harness (not model output) against 15 fictional records. Each adversarial variant must be caught by its check; each faithful response must pass every check."
      : "Live responses from the configured model for 15 fictional records. No real patient data.",
    "",
    `**${passed} of ${results.length} cases as expected.**`,
    "",
    "| Record | Lang | Case | Result | Failed checks |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const failed = r.checks.filter((c) => !c.passed);
      return `| ${r.recordId} | ${r.locale} | ${r.variant} | ${r.asExpected ? "ok" : "**UNEXPECTED**"} | ${
        failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`).join("; ") || "none"
      } |`;
    }),
  ];
  if (mode === "live") {
    const lat = results.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]));
    const inTok = results.flatMap((r) => (r.inputTokens === null ? [] : [r.inputTokens]));
    const outTok = results.flatMap((r) => (r.outputTokens === null ? [] : [r.outputTokens]));
    const avg = (v: number[]) =>
      v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    lines.push(
      "",
      "## Latency and tokens",
      "",
      `- Latency p50 ${percentile(lat, 50)} ms, p95 ${percentile(lat, 95)} ms (budget ${EVAL_LIMITS.latencyBudgetMs} ms)`,
      `- Input tokens: mean ${avg(inTok)}; output tokens: mean ${avg(outTok)}, max ${outTok.length ? Math.max(...outTok) : null} (limit 2048)`,
      "",
      "Responses are in the JSON report for clinician review.",
    );
  }
  return lines.join("\n") + "\n";
}

export function writeReports(results: CaseResult[], mode: "replay" | "live", outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const base =
    mode === "replay" ? "replay" : `live-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify(results, null, 2) + "\n");
  writeFileSync(join(outDir, `${base}.md`), renderMarkdown(results, mode));
  return base;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const live = process.argv.includes("--live");
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "reports");
  const results = live ? await runLive() : runReplay();
  const base = writeReports(results, live ? "live" : "replay", outDir);
  const bad = results.filter((r) => !r.asExpected).length;
  process.stdout.write(
    `${results.length - bad}/${results.length} cases as expected. Report: reports/${base}.md\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}
