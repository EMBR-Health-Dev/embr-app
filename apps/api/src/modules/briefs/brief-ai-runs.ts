import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { Locale } from "../../lib/locale.js";
import type { BriefAiFailureReason, BriefAiTelemetry } from "./brief.ai.js";

/**
 * Records one attempt at the BRIEF's AI wording for the reliability
 * metrics (admin dashboard). Counts, codes and timings only: no user
 * id, no brief id, no text, so a row can never say whose brief it was
 * or what it said.
 *
 * Never throws: a metrics write must not cost her the brief.
 */
export async function recordBriefAiRun(run: {
  telemetry: BriefAiTelemetry | null;
  outcome: "ACCEPTED" | "REJECTED";
  reason: BriefAiFailureReason | null;
  promptVersion: string;
  model: string;
  locale: Locale;
}): Promise<void> {
  try {
    await prisma.briefAiRun.create({
      data: {
        outcome: run.outcome,
        reason: run.reason,
        model: run.telemetry?.model ?? run.model,
        promptVersion: run.promptVersion,
        locale: run.locale,
        latencyMs: Math.max(0, Math.round(run.telemetry?.latencyMs ?? 0)),
        inputTokens: run.telemetry?.inputTokens ?? null,
        outputTokens: run.telemetry?.outputTokens ?? null,
      },
    });
  } catch (err) {
    logger.warn(
      { errName: err instanceof Error ? err.name : typeof err },
      "could not record brief AI run metrics",
    );
  }
}
