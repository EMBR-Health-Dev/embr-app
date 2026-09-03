import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AppError } from "@embr/shared";
import { symptomCategorySchema } from "@embr/validation";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { Stage4Pattern, Stage4Result } from "./stage4-interpretation.js";

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
  /** The deterministic Stage 4 findings this brief's evidence actually
   * produced — the AI is expected to select from and echo these back
   * (see BriefContent.patterns' own doc comment), never to construct
   * new ones from symptomSummary/cycleSummary itself. This is the
   * entire mechanism that keeps "the LLM must not independently
   * discover Stage 4 patterns" true: the model is never given the raw
   * material to compute a pattern on its own, only the ones that
   * already exist. */
  interpretation: Stage4Result;
}

export interface BriefContent {
  narrative: string;
  discussionTopics: string[];
  /** Stage4Pattern[] from stage4-interpretation.ts — the single source
   * of truth for this shape, not redefined here. The model does not
   * author these fields; it selects from and echoes back the patterns
   * it was given (id, evidenceRef, and all template text included) for
   * whichever ones it actually narrated. Cross-checking that what's
   * echoed here genuinely matches what was supplied is a separate,
   * later concern (structural citation validation) — this step only
   * validates that the shape returned is well-formed. */
  patterns: Stage4Pattern[];
}

/** Mirrors Stage4EvidenceRef from stage4-interpretation.ts exactly — a
 * union of three closed object shapes, not "any object with some
 * keys." .strict() on each branch rejects extra/misplaced keys rather
 * than silently accepting them, matching "preserve the existing
 * discriminated shapes... rather than accepting arbitrary objects." */
const evidenceRefSchema = z.union([
  z.object({ category: symptomCategorySchema }).strict(),
  z.object({ categoryA: symptomCategorySchema, categoryB: symptomCategorySchema }).strict(),
  z.object({ treatmentId: z.string().min(1) }).strict(),
]);

const stage4PatternTypeSchema = z.enum([
  "frequency_increased",
  "frequency_decreased",
  "co_occurrence_detected",
  "treatment_window_changed",
]);

/** Structural validation of Stage4Pattern's shape — every field name
 * and type here must stay in lockstep with stage4-interpretation.ts's
 * own Stage4Pattern interface, which remains the source of truth (see
 * BriefContent's doc comment above). This does not verify that a
 * given pattern actually came from the interpretation this brief was
 * built from — only that whatever the model returned is shaped like a
 * real pattern, not an arbitrary object. */
const stage4PatternSchema = z.object({
  id: z.string().min(1),
  type: stage4PatternTypeSchema,
  observation: z.string().min(1),
  association: z.string().min(1).optional(),
  interpretation: z.string().min(1),
  caveat: z.string().min(1),
  confidence: z.literal("descriptive"),
  evidenceRef: evidenceRefSchema,
});

/** Wire-format-only shape for a discussion topic — never exposed
 * outside this file. `patternIds` is how a topic proves the same
 * citation-based provenance the `patterns` array already proves for
 * the narrative: not every topic needs to reference a specific
 * finding (an empty array is fine — a broad, open question doesn't
 * assert anything about the data at all), but any id a topic does
 * cite must resolve to a pattern the model also echoed in `patterns`
 * for the same response, which is itself validated against canonical
 * evidence downstream in brief.service.ts. This closes the one gap
 * `patterns` alone didn't cover: before this, a discussion topic could
 * assert a relationship between two symptoms or a symptom and a
 * treatment with zero structural check that the relationship was ever
 * actually established by Stage 4 — only the system prompt (rule 8)
 * asked the model not to, which is an instruction, not a guarantee,
 * exactly like every other place in this file that needed a
 * deterministic backstop instead of trusting the prompt alone. */
const discussionTopicSchema = z.object({
  text: z.string().min(1),
  patternIds: z.array(z.string()),
});

const rawResponseSchema = z.object({
  narrative: z.string().min(1),
  discussionTopics: z.array(discussionTopicSchema).min(1).max(8),
  patterns: z.array(stage4PatternSchema),
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
 * - Rules 6-9 (patterns) exist because Stage 4 interpretation gives the
 *   model, for the first time, evidence that two facts are genuinely
 *   related (a co-occurrence pair, a treatment tied to a before/after
 *   window) sitting alongside evidence that isn't related to anything.
 *   Without an explicit instruction to only echo supplied patterns
 *   verbatim, a model asked to "narrate the interesting findings" will
 *   readily connect two things that were never actually linked by any
 *   deterministic evidence — see stage4-interpretation.ts's own doc
 *   comment on why that composition, not narration, is Stage 4's job.
 * - Rule 10 (discussion topic citations) closes the same gap for
 *   discussion topics specifically. "patterns" is checked
 *   deterministically (see stage4-validation.ts), but a discussion
 *   topic could otherwise assert a relationship in question form
 *   ("Ask whether X is connected to Y") with nothing structurally
 *   requiring that relationship to be real — this makes citation
 *   required wherever a topic does reference specific evidence, then
 *   validates it the same deterministic way "patterns" already is.
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
2. Never diagnose, name a medical condition, suggest a cause, or recommend any treatment, medication, dosage, or lifestyle change — including when discussing a pattern from the structured interpretation data.
3. Every discussion topic must be phrased as an open question the person could ask their GP — never as an assertion, conclusion, or piece of advice. Write "Ask whether the increase in hot flash frequency since [date] is a typical pattern at this stage" — not "Your hot flashes are worsening, which may indicate X."
4. If the data is too sparse to support a meaningful summary, say so plainly rather than inventing a pattern.
5. Keep the narrative factual and neutral — this is a data summary, not medical commentary.
6. If you reference a finding from the structured interpretation data in your narrative or discussion topics, include it in "patterns" exactly as supplied — the same id, type, observation, association (if present), interpretation, caveat, confidence, and evidenceRef. Never modify that text, never invent a new id, and never invent an evidenceRef that wasn't given to you.
7. Only include a pattern in "patterns" if you actually referenced it in the narrative or discussion topics. If none of the supplied patterns are relevant, or none were supplied, "patterns" must be an empty array.
8. Never assert a relationship between two symptoms, or between a symptom and a treatment, unless a pattern explicitly covering exactly that pairing was supplied to you. Having two related facts each appear elsewhere in the data does not authorize you to connect them yourself.
9. "confidence" on every pattern is always exactly "descriptive" — never change it.
10. Each discussion topic is an object: {"text": "...", "patternIds": [...]}. If a topic references a specific finding (asks about a frequency change, a co-occurrence, or a treatment window), its "patternIds" must list the id(s) of the pattern(s) it's about, and those ids must also appear in "patterns". If a topic is a general question that doesn't reference any specific finding, "patternIds" must be an empty array — never a fabricated id.

Respond with JSON only, no other text, in exactly this shape:
{"narrative": "...", "discussionTopics": [{"text": "...", "patternIds": ["..."]}], "patterns": [{"id": "...", "type": "...", "observation": "...", "association": "...", "interpretation": "...", "caveat": "...", "confidence": "descriptive", "evidenceRef": {}}]}`;

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
 *
 * The deny-list is scanned across the narrative, discussion topics,
 * AND every pattern's observation/association/interpretation/caveat —
 * a pattern is only supposed to echo Stage 4's own fixed template
 * text verbatim (see BriefContent's doc comment), but this check
 * doesn't assume that held; it treats pattern text as untrusted model
 * output like everything else here, not as pre-cleared just because
 * it's *supposed* to be a verbatim copy. Cross-checking that a
 * returned pattern's text genuinely matches the supplied evidence
 * word-for-word is a separate, later concern (structural citation
 * validation) — this is only the same deny-list scan already applied
 * to the rest of the response, applied consistently to the new field
 * too.
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

  const patternText = content.patterns.flatMap((pattern) =>
    [pattern.observation, pattern.association, pattern.interpretation, pattern.caveat].filter(
      (value): value is string => value !== undefined,
    ),
  );
  const combinedText = [content.narrative, ...content.discussionTopics, ...patternText].join(" ");
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
              interpretation: input.interpretation,
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

    const result = rawResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(
        { zodError: result.error.message },
        "brief AI response didn't match the expected shape",
      );
      throw AppError.internal("Brief generation failed: unexpected response shape");
    }

    // Discussion-topic citation provenance: any patternIds a topic
    // cites must resolve to a pattern the model also echoed in this
    // same response's `patterns` array — the same array
    // stage4-validation.ts checks against canonical evidence
    // downstream. An empty patternIds is always fine (see
    // discussionTopicSchema's own doc comment); only a citation to
    // something that doesn't exist in `patterns` fails.
    const returnedPatternIds = new Set(result.data.patterns.map((pattern) => pattern.id));
    for (const topic of result.data.discussionTopics) {
      for (const patternId of topic.patternIds) {
        if (!returnedPatternIds.has(patternId)) {
          throw AppError.internal(
            `Brief generation failed: discussion topic cited a pattern id not present in ` +
              `patterns: "${patternId}"`,
          );
        }
      }
    }

    // patternIds only ever needed to exist for the validation above —
    // BriefContent's public shape stays discussionTopics: string[],
    // exactly as it was before this citation requirement existed, so
    // nothing downstream (brief.service.ts, the DTO, persistence, any
    // UI surface) needs to change.
    const content: BriefContent = {
      narrative: result.data.narrative,
      discussionTopics: result.data.discussionTopics.map((topic) => topic.text),
      patterns: result.data.patterns,
    };

    const safetyFailure = failsContentSafety(content);
    if (safetyFailure) {
      // Fail closed, same as every other validation failure above --
      // brief.service.ts awaits this call before ever persisting
      // anything, so throwing here means no ClinicalBrief is created
      // at all, not a partially-trusted one.
      throw new Error(`Brief output failed content safety check: ${safetyFailure}`);
    }

    return content;
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
