import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AppError } from "@embr/shared";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export interface BriefInput {
  fromDate: string;
  toDate: string;
  symptomSummary: Array<{
    category: string;
    count: number;
    severityBreakdown: Record<string, number>;
  }>;
  cycleSummary: {
    averageCycleLengthDays: number | null;
    cycleCount: number;
    periodDaysLogged: number;
  };
}

export interface BriefContent {
  narrative: string;
  discussionTopics: string[];
}

const briefResponseSchema = z.object({
  narrative: z.string().min(1),
  discussionTopics: z.array(z.string().min(1)).min(1).max(8),
});

/**
 * EMBR is explicitly not a diagnostic tool and does not give medical
 * advice (see README.md's positioning) — this system prompt is the
 * enforcement point for that, not just a description of it. Every rule
 * below exists because the failure mode it prevents is a real one for
 * a model asked to "summarize health data":
 *
 * - Rule 1 (data-grounded only) stops the model from filling gaps with
 *   plausible-sounding medical knowledge it has from training, rather
 *   than what this specific person actually logged.
 * - Rule 2 (no diagnosis/treatment) is the hard line — the moment the
 *   output suggests a cause or a treatment, it's no longer a tracking
 *   summary, it's medical advice from an unqualified source.
 * - Rule 3 (questions, not assertions) is what keeps "discussion
 *   topics" from quietly becoming rule-2 violations under a different
 *   name — "ask about X" stays firmly in "help the patient prepare for
 *   their own conversation with their own doctor" territory; "X may
 *   indicate Y" does not.
 * - Rule 4 (say so if sparse) exists because a model asked to find
 *   patterns in three data points will, if not told otherwise, find
 *   them anyway.
 *
 * Deliberately given only the structured, aggregated summary — never
 * raw free-text symptom-log notes. Notes can contain anything a person
 * chose to write in an unstructured field, including highly personal
 * detail with no bearing on the categories/counts this brief is
 * actually summarizing; sending only the aggregate is both a privacy
 * minimization and a way to keep the model's input (and therefore its
 * output) tightly scoped to what this feature is actually for.
 */
const SYSTEM_PROMPT = `You are helping structure a person's self-tracked menopause symptom and cycle data into a summary for their upcoming GP appointment.

Follow these rules strictly:
1. Describe only patterns directly supported by the structured data provided. Never infer, speculate, or add information not present in the data — including general medical knowledge about menopause that isn't reflected in this specific data.
2. Never diagnose, name a medical condition, suggest a cause, or recommend any treatment, medication, dosage, or lifestyle change.
3. Every discussion topic must be phrased as an open question the person could ask their GP — never as an assertion, conclusion, or piece of advice. Write "Ask whether the increase in hot flash frequency since [date] is a typical pattern at this stage" — not "Your hot flashes are worsening, which may indicate X."
4. If the data is too sparse to support a meaningful summary, say so plainly rather than inventing a pattern.
5. Keep the narrative factual and neutral — this is a data summary, not medical commentary.

Respond with JSON only, no other text, in exactly this shape:
{"narrative": "...", "discussionTopics": ["...", "..."]}`;

export const briefAi = {
  async generate(input: BriefInput): Promise<BriefContent> {
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // SDK default is a 10-minute timeout with automatic retries on
      // timeout — meaning a slow response could hold this synchronous
      // request/response endpoint open for a very long multiple of that
      // before failing. This is a short text-generation call
      // (max_tokens: 1024); 30s with a single retry keeps worst-case
      // latency bounded and predictable instead of hanging.
      timeout: 30_000,
      maxRetries: 1,
    });

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: env.ANTHROPIC_BRIEF_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              dateRange: { from: input.fromDate, to: input.toDate },
              symptomSummary: input.symptomSummary,
              cycleSummary: input.cycleSummary,
            }),
          },
        ],
      });
    } catch (err) {
      throw classifyAnthropicError(err);
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw AppError.internal("Brief generation failed: model returned no text content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw AppError.internal("Brief generation failed: model response was not valid JSON");
    }

    const result = briefResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(
        { zodError: result.error.message },
        "brief AI response didn't match the expected shape",
      );
      throw AppError.internal("Brief generation failed: unexpected response shape");
    }

    return result.data;
  },
};

/**
 * The Anthropic SDK's error classes (Anthropic.APIError and its
 * subclasses) carry a real `.status` matching Anthropic's own HTTP
 * response code, and extend Error. Left uncaught, that status collides
 * with the global error handler's hasClientErrorStatus check
 * (error-handler.ts) — any Anthropic 4xx (429 rate-limited, 401 bad API
 * key, 400 malformed request, etc.) would be reported to *our* client
 * as a 400 VALIDATION_ERROR, using Anthropic's raw error message
 * verbatim. That's wrong on two counts: it's not the end user's
 * request that's invalid (they never control what's sent to Anthropic —
 * this endpoint only ever forwards aggregated, validated internal
 * data), and Anthropic's raw error body can describe our own
 * credentials/config ("invalid x-api-key" etc.), which must never reach
 * an end user.
 *
 * None of these are the requesting user's fault, so nothing here maps
 * to VALIDATION_ERROR. Two buckets instead:
 *  - Transient upstream issues (rate limited, connection/timeout, 5xx)
 *    -> SERVICE_UNAVAILABLE, safe generic message, logged at warn — the
 *    caller can reasonably retry shortly.
 *  - Our own misconfiguration (bad API key, malformed request, wrong
 *    model name) -> INTERNAL_ERROR, safe generic message, logged at
 *    error — this needs an operator's attention, not a retry.
 * In both cases the real Anthropic error is logged server-side (for
 * Sentry/ops), never returned to the client.
 */
function classifyAnthropicError(err: unknown): AppError {
  if (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.InternalServerError
  ) {
    logger.warn({ err }, "brief generation: transient Anthropic API error");
    return AppError.serviceUnavailable(
      "Brief generation is temporarily unavailable — please try again shortly.",
      err,
    );
  }

  if (err instanceof Anthropic.APIError) {
    // AuthenticationError, PermissionDeniedError, BadRequestError,
    // NotFoundError, UnprocessableEntityError, or any other status —
    // all indicate a bug or misconfiguration on our side, not a
    // transient upstream blip and not the user's fault.
    logger.error({ err, status: err.status }, "brief generation: Anthropic API error");
    return AppError.internal("Brief generation failed", err);
  }

  logger.error({ err }, "brief generation: unexpected error calling Anthropic");
  return AppError.internal("Brief generation failed", err);
}
