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

/**
 * Defense-in-depth, not the primary safety mechanism — the system
 * prompt above is that. This exists because a system prompt is an
 * instruction, not a guarantee: a model can drift, and this is a cheap,
 * deterministic backstop that doesn't depend on the model having
 * followed instructions correctly. Two checks:
 *
 * 1. Every discussion topic must literally end in "?" — mechanically
 *    verifies rule 3 (questions, never assertions) rather than just
 *    trusting the prompt was followed.
 * 2. A short, deliberately narrow deny-list for the clearest possible
 *    violations of rules 1–2: the word "diagnos-" appearing at all
 *    (the model was explicitly told never to use it, so any
 *    occurrence — even hedged — is worth failing closed on),
 *    "you should take/start/stop/try" and "I recommend" (treatment
 *    directives), and a dosage-shaped number (nothing in this
 *    feature's input data could ever legitimately produce one, so its
 *    presence in the output is itself a red flag). Deliberately not a
 *    broad classifier — narrow enough to have very few false
 *    positives, which matters because failing here means throwing
 *    away a real generation attempt.
 */
const PROHIBITED_PATTERNS = [
  /\bdiagnos(is|ed|e|es|ing)?\b/i,
  /\byou should (take|start|stop|try)\b/i,
  /\bi recommend\b/i,
  /\b\d+\s?(mg|mcg|ml|milligrams?)\b/i,
];

function failsContentSafety(content: BriefContent): string | null {
  for (const topic of content.discussionTopics) {
    if (!topic.trim().endsWith("?")) {
      return `Discussion topic was not phrased as a question: "${topic}"`;
    }
  }

  const combinedText = [content.narrative, ...content.discussionTopics].join(" ");
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(combinedText)) {
      return `Output matched a prohibited pattern: ${pattern}`;
    }
  }

  return null;
}

export const briefAi = {
  async generate(input: BriefInput): Promise<BriefContent> {
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Explicit, reviewed values — not the SDK's own defaults (a
      // 10-minute timeout and its own retry count), which are tuned
      // for long-running/background use, not a synchronous request a
      // person is sitting in front of a "Generating…" spinner for.
      // maxRetries only applies to the SDK's own retryable conditions
      // (connection errors, 408/429/5xx) — not reimplementing retry
      // logic here, just making the count a deliberate decision
      // instead of an implicit default.
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
      // Anthropic's own SDK errors (APIError and its subclasses --
      // AuthenticationError, RateLimitError, BadRequestError, ...)
      // carry a real, readonly `.status` property in the same 4xx/5xx
      // shape this API's own client-facing errors use. Without this
      // catch, the global error handler's duck-typed
      // hasClientErrorStatus() check would misclassify e.g. a 401 from
      // a misconfigured ANTHROPIC_API_KEY as *our own user's* bad
      // request -- passing Anthropic's raw error message straight
      // through to them, and, worse, logging it at warn instead of
      // error, silently missing the Sentry page for what's actually a
      // real incident on our side. Wrapping here guarantees every
      // failure from this call is always a 500, always logged and
      // alerted as an incident, and never leaks upstream error detail
      // to the client -- the original error is preserved as `cause`
      // for our own logs/Sentry, just never sent over the wire.
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

    const safetyFailure = failsContentSafety(result.data);
    if (safetyFailure) {
      // Fail closed, same as every other validation failure above --
      // brief.service.ts awaits this call before ever persisting
      // anything, so throwing here means no ClinicalBrief is created
      // at all, not a partially-trusted one.
      throw new Error(`Brief output failed content safety check: ${safetyFailure}`);
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
