/**
 * SYNTHETIC responses for the offline (replay) mode. These are written
 * by this harness, not by a model, and are never presented as model
 * output. They exist to prove the checks catch what they should, and
 * to keep the harness runnable in CI with no API key and no network.
 *
 * "faithful" uses only the record's own supplied patterns and fixed
 * template text. Each adversarial variant breaks exactly one rule.
 */
import type { Locale } from "../../src/lib/locale.js";
import type { CheckName, ModelOutput } from "./checks.js";
import type { PreparedRecord } from "./pipeline.js";

export type Variant =
  | "faithful"
  | "invented_citation"
  | "prohibited_language"
  | "wrong_language"
  | "truncated"
  | "overlong";

/** Which check each variant must fail (faithful must fail none). */
export const EXPECTED_FAILURE: Record<Variant, CheckName | null> = {
  faithful: null,
  invented_citation: "citation_integrity",
  prohibited_language: "prohibited_language",
  wrong_language: "language",
  truncated: "truncation",
  overlong: "length",
};

const COPY: Record<Locale, { intro: (n: number) => string; sparse: string; topic: string }> = {
  en: {
    intro: (n) => `During this period, ${n} symptom entries were recorded.`,
    sparse: "There are too few entries to describe a pattern with confidence.",
    topic: "Is it useful to keep recording these symptoms before the next appointment?",
  },
  fr: {
    intro: (n) => `Sur cette période, ${n} saisies de symptômes ont été enregistrées.`,
    sparse: "Les saisies sont trop peu nombreuses pour décrire une tendance avec assurance.",
    topic: "Est-il utile de continuer à noter ces symptômes avant la prochaine consultation ?",
  },
  ja: {
    intro: (n) => `この期間に記録された症状は${n}件でした。`,
    sparse: "記録が少ないため、傾向をはっきり述べることはできません。",
    topic: "次の受診まで、これらの症状の記録を続けるとよいでしょうか？",
  },
};

const PROHIBITED: Record<Locale, string> = {
  en: "This is consistent with a diagnosis of perimenopause.",
  fr: "Cela correspond à un diagnostic de périménopause.",
  ja: "これは更年期の診断に一致します。",
};

const OTHER_LANGUAGE: Record<Locale, string> = {
  en: "この期間の記録をまとめました。",
  fr: "この期間の記録をまとめました。",
  ja: "This summarises the entries recorded during this period.",
};

function body(prepared: PreparedRecord, variant: Variant) {
  const { locale } = prepared.record;
  const copy = COPY[locale];
  const patterns = prepared.aiInput.interpretation.patterns;
  const entries = prepared.aiInput.symptomSummary.reduce((sum, e) => sum + e.count, 0);
  let narrative = [
    copy.intro(entries),
    ...(patterns.length > 0 ? patterns.map((p) => p.observation) : [copy.sparse]),
  ].join(" ");
  let echoed: unknown[] = patterns;
  const topics = [{ text: copy.topic, patternIds: patterns.slice(0, 1).map((p) => p.id) }];

  if (variant === "invented_citation") {
    echoed = [
      ...patterns,
      {
        id: "co_occurrence_detected:HOT_FLASH+LOW_MOOD:invented",
        type: "co_occurrence_detected",
        evidenceRef: { categoryA: "HOT_FLASH", categoryB: "LOW_MOOD" },
        observation: "Invented.",
        interpretation: "Invented.",
        caveat: "Invented.",
        confidence: "descriptive",
      },
    ];
  }
  if (variant === "prohibited_language") narrative = `${narrative} ${PROHIBITED[locale]}`;
  if (variant === "wrong_language") narrative = OTHER_LANGUAGE[locale];
  if (variant === "overlong") narrative = `${narrative} ${copy.sparse.repeat(60)}`;

  return { narrative, discussionTopics: topics, patterns: echoed };
}

export function syntheticOutput(prepared: PreparedRecord, variant: Variant): ModelOutput {
  const text = JSON.stringify(body(prepared, variant));
  if (variant === "truncated") {
    return {
      text: text.slice(0, Math.floor(text.length / 2)),
      stopReason: "max_tokens",
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
    };
  }
  return { text, stopReason: "end_turn", latencyMs: null, inputTokens: null, outputTokens: null };
}
