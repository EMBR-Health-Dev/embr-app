import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../../config/env.js";

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
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
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

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic response contained no text content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      throw new Error("Anthropic response was not valid JSON");
    }

    const result = briefResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Anthropic response didn't match the expected shape: ${result.error.message}`,
      );
    }

    return result.data;
  },
};
