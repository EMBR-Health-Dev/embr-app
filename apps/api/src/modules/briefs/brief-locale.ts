import type { Locale } from "../../lib/locale.js";

/**
 * Every JA string in this file that has a counterpart in the web app's
 * own already-shipped, already-reviewed translations (apps/web/messages/
 * ja.json's "Enums" and "Brief" namespaces) is copied from there
 * verbatim, not independently retranslated — the same category names,
 * the same section headings, the same safety-framing sentences the web
 * UI already shows a Japanese user for this exact same feature. This is
 * deliberate: a Japanese Clinical Brief PDF must say the same thing, in
 * the same words, as the Japanese web/mobile UI already showing the
 * data it was built from — two independently-worded translations of
 * "the same meaning" is exactly the inconsistency this file exists to
 * avoid. Only strings with no existing web/mobile counterpart (PDF-only
 * chrome: the masthead eyebrow, the closing three-way disclaimer, a
 * couple of section headings the PDF phrases differently from the web
 * UI on purpose — see categorySignalsHeading below) are translated
 * fresh here, and are called out individually where that's the case.
 */

// ---- Category / treatment / severity labels ----
// Mirrors apps/web/messages/ja.json's Enums.category exactly.
const CATEGORY_LABELS_JA: Record<string, string> = {
  HOT_FLASH: "ホットフラッシュ",
  NIGHT_SWEATS: "寝汗",
  MOOD_CHANGE: "気分の変化",
  SLEEP_DISTURBANCE: "睡眠障害",
  BRAIN_FOG: "ブレインフォグ",
  JOINT_PAIN: "関節痛",
  FATIGUE: "倦怠感",
  ANXIETY: "不安",
  IRREGULAR_HEARTBEAT: "不整脈",
  VAGINAL_DRYNESS: "膣の乾燥",
  LIBIDO_CHANGE: "性欲の変化",
  WEIGHT_CHANGE: "体重の変化",
  HEADACHE: "頭痛",
  OTHER: "その他",
};

/** English behavior unchanged from export/pdf.ts's own categoryLabel —
 * a generic underscore-to-title-case transform. Not imported from there
 * directly: that file is a different, unrelated feature (the raw
 * clinician-summary export, out of this task's scope — see brief.pdf.ts's
 * own doc comment on why its treatmentCategoryLabel override is local
 * rather than shared too), and duplicating this one-line transform here
 * keeps this module fully self-contained rather than reaching into
 * another feature's file for a locale param it doesn't need. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function categoryLabel(category: string, locale: Locale): string {
  if (locale === "ja") return CATEGORY_LABELS_JA[category] ?? category;
  return titleCase(category);
}

// Mirrors apps/web/messages/ja.json's Enums.treatmentCategory exactly.
const TREATMENT_CATEGORY_LABELS_JA: Record<string, string> = {
  HRT: "HRT（ホルモン補充療法）",
  SUPPLEMENT: "サプリメント",
  MEDICATION: "医薬品",
  LIFESTYLE: "生活習慣",
  OTHER: "その他",
};

export function treatmentCategoryLabel(category: string, locale: Locale): string {
  if (locale === "ja") return TREATMENT_CATEGORY_LABELS_JA[category] ?? category;
  // HRT is a real acronym, not a word to title-case ("Hrt") — same fix,
  // same reasoning, as export/pdf.ts's own local override.
  if (category === "HRT") return "HRT";
  return titleCase(category);
}

// Mirrors apps/web/messages/ja.json's Enums.severity exactly.
const SEVERITY_LABELS_JA: Record<string, string> = {
  MILD: "軽度",
  MODERATE: "中等度",
  SEVERE: "重度",
};

export function severityLabel(severity: string, locale: Locale): string {
  if (locale === "ja") return SEVERITY_LABELS_JA[severity] ?? severity;
  return severity.toLowerCase();
}

// ---- Static PDF labels ----
// Every key here has both an "en" and "ja" value so a missing
// translation is a compile error, not a silent English fallback deep
// in a Japanese document.
interface PdfStrings {
  documentTitle: string;
  observationPeriodLabel: string;
  preparedFor: (email: string) => string;
  generatedAt: (utcTimestamp: string) => string;
  topDisclaimer: string;
  summaryHeading: string;
  groundedInHeading: string;
  questionsHeading: string;
  symptomSignalsHeading: string;
  noSymptomsText: string;
  occurrenceLine: (count: number, severityBreakdown: string) => string;
  comparedWithPreviousHeading: string;
  frequencyComparisonLine: (currentCount: number, previousCount: number) => string;
  ongoingSymptomsHeading: string;
  persistentSymptomLine: (category: string) => string;
  patternsNoticedHeading: string;
  coOccurrenceLine: (categoryA: string, categoryB: string, days: number) => string;
  cycleSummaryHeading: string;
  notEnoughCycleDataText: string;
  averageCycleLengthLine: (days: number, cycleCount: number) => string;
  periodDaysLoggedLine: (days: number) => string;
  treatmentsHeading: string;
  noTreatmentsText: string;
  ongoingLabel: string;
  treatmentSafetyNote: string;
  treatmentImpactHeading: string;
  treatmentImpactInsufficientText: string;
  treatmentImpactLine: (
    beforeCount: number,
    beforeDays: number,
    afterCount: number,
    afterDays: number,
  ) => string;
  closingDisclaimer: string;
}

const EN: PdfStrings = {
  // Unchanged from the pre-localization English PDF — see this file's
  // own doc comment on why "Clinical Brief" here and "EMBR BRIEF"
  // elsewhere in the product (apps/web/messages/en.json's
  // Brief.title) are allowed to differ: this is pre-existing English
  // wording this task preserves as closely as possible, not
  // reconciled as part of localizing it.
  documentTitle: "Clinical Brief",
  observationPeriodLabel: "OBSERVATION PERIOD",
  preparedFor: (email) => `Prepared for ${email}`,
  generatedAt: (utcTimestamp) => `Generated ${utcTimestamp} UTC`,
  topDisclaimer:
    "This is a structured summary of self-tracked data, generated to help a conversation with a" +
    " GP. Not a diagnosis, and not medical advice.",
  summaryHeading: "Summary",
  groundedInHeading: "Grounded in your data",
  questionsHeading: "Questions to bring to your GP",
  symptomSignalsHeading: "Symptom Signals",
  noSymptomsText: "No symptoms logged in this range.",
  occurrenceLine: (count, severityBreakdown) =>
    `${count} occurrence${count === 1 ? "" : "s"} (${severityBreakdown})`,
  comparedWithPreviousHeading: "Compared with the previous period",
  frequencyComparisonLine: (currentCount, previousCount) =>
    `Reported on ${currentCount} day${currentCount === 1 ? "" : "s"}, compared with` +
    ` ${previousCount} day${previousCount === 1 ? "" : "s"} in the previous period.`,
  ongoingSymptomsHeading: "Ongoing symptoms",
  persistentSymptomLine: (category) => `${category} remained present across both periods.`,
  patternsNoticedHeading: "Patterns noticed",
  coOccurrenceLine: (categoryA, categoryB, days) =>
    `${categoryA} and ${categoryB} were both reported on the same day on ${days}` +
    ` occasion${days === 1 ? "" : "s"}.`,
  cycleSummaryHeading: "Cycle summary",
  notEnoughCycleDataText: "Not enough period-start entries in this range to compute cycle length.",
  averageCycleLengthLine: (days, cycleCount) =>
    `Average cycle length: ${days} days (${cycleCount} cycles recorded)`,
  periodDaysLoggedLine: (days) => `${days} period day${days === 1 ? "" : "s"} logged`,
  treatmentsHeading: "Treatments logged during this period",
  noTreatmentsText: "No treatments logged in this range.",
  ongoingLabel: "Ongoing",
  treatmentSafetyNote:
    "This reflects what you've logged. It does not assess whether a treatment is working or" +
    " make treatment recommendations.",
  treatmentImpactHeading: "Observed changes after starting treatment",
  treatmentImpactInsufficientText: "Not enough time has passed since starting to compare yet.",
  treatmentImpactLine: (beforeCount, beforeDays, afterCount, afterDays) =>
    `${beforeCount} symptom log${beforeCount === 1 ? "" : "s"} in the ${beforeDays} days before` +
    ` starting, compared with ${afterCount} symptom log${afterCount === 1 ? "" : "s"} in the` +
    ` ${afterDays} days after.`,
  closingDisclaimer:
    "Everything above reflects what was reported and, where noted, patterns observed in that" +
    " reported data. None of it is a clinical interpretation or a diagnosis. That judgment" +
    " belongs to the clinician reading this alongside you.",
};

const JA: PdfStrings = {
  // "EMBR BRIEF" — reused verbatim from apps/web/messages/ja.json's
  // Brief.title, not a fresh translation of "Clinical Brief." The web
  // app already established "BRIEF" as the Japanese-facing name for
  // this exact document (kept untranslated, the same way "EMBR" is);
  // inventing a second Japanese name ("臨床ブリーフ" or similar) for
  // the PDF specifically would mean the same document is called two
  // different things depending on which surface a person is looking
  // at, for no reason.
  documentTitle: "EMBR BRIEF",
  observationPeriodLabel: "観察期間",
  preparedFor: (email) => `${email} 宛`,
  generatedAt: (utcTimestamp) => `作成日時: ${utcTimestamp} UTC`,
  // Reused verbatim from Brief.description's own already-reviewed JA
  // text rather than translated fresh — this PDF line and the web
  // page's own description say almost the same thing in English
  // already (pre-existing, minor wording drift this task doesn't
  // reconcile — see EN.topDisclaimer above); reusing the vetted
  // translation guarantees identical safety framing instead of two
  // independently-worded Japanese versions of the same disclaimer.
  topDisclaimer:
    "あなたの記録を整理した要約に、担当医との会話に使える質問を添えたものです。これは会話の材料となる" +
    "データ要約であり、診断や医学的アドバイスではありません。",
  // "要約" (native Japanese "summary"), not "サマリー" — avoids reading
  // as a near-homophone of "BRIEF" itself inside the same document.
  summaryHeading: "要約",
  groundedInHeading: "データに基づく根拠",
  questionsHeading: "担当医への質問",
  // "症状の頻度" (Brief.symptomFrequency's own JA text), not a literal
  // translation of the English PDF's stylistic "Symptom Signals" —
  // see this file's own doc comment on reusing the vetted web
  // translation for the same underlying concept rather than
  // inventing a second, less natural phrase ("症状シグナル") no
  // Japanese user has seen anywhere else in the product.
  symptomSignalsHeading: "症状の頻度",
  noSymptomsText: "この期間に記録された症状はありません。",
  occurrenceLine: (count, severityBreakdown) => `${count}回（${severityBreakdown}）`,
  comparedWithPreviousHeading: "前回の期間との比較",
  frequencyComparisonLine: (currentCount, previousCount) =>
    `今回の期間に${currentCount}日報告され、前回の期間は${previousCount}日でした。`,
  ongoingSymptomsHeading: "継続している症状",
  persistentSymptomLine: (category) => `${category}は両方の期間で継続して報告されました。`,
  patternsNoticedHeading: "気づいたパターン",
  coOccurrenceLine: (categoryA, categoryB, days) =>
    `${categoryA}と${categoryB}は同じ日に${days}日報告されました。`,
  cycleSummaryHeading: "周期の要約",
  notEnoughCycleDataText: "この期間の周期の長さを計算するには、生理開始日の記録が不足しています。",
  averageCycleLengthLine: (days, cycleCount) => `平均周期: ${days}日（${cycleCount}周期記録あり）`,
  periodDaysLoggedLine: (days) => `記録された生理日数: ${days}日`,
  treatmentsHeading: "この期間に記録された治療",
  noTreatmentsText: "この期間に記録された治療はありません。",
  ongoingLabel: "継続中",
  treatmentSafetyNote:
    "これはあなたが記録した内容の反映です。治療の効果を評価したり、治療に関する提案をしたりするもので" +
    "はありません。",
  treatmentImpactHeading: "治療開始後の変化",
  treatmentImpactInsufficientText: "比較するにはまだ十分な期間が経過していません。",
  treatmentImpactLine: (beforeCount, beforeDays, afterCount, afterDays) =>
    `開始前${beforeDays}日間で${beforeCount}件の記録、開始後${afterDays}日間で${afterCount}件の` +
    `記録がありました。`,
  // No existing web/mobile counterpart — this is the PDF's own closing
  // statement of the reported-data / observed-pattern /
  // clinical-interpretation distinction, translated fresh and checked
  // against the English line-by-line: adds no claim, narrows nothing,
  // keeps "that judgment belongs to the clinician" exactly as absolute
  // in Japanese as in English.
  closingDisclaimer:
    "上記はすべて、報告された内容と、該当箇所で示された報告データ内のパターンを反映したものです。" +
    "これらは臨床的な解釈や診断ではありません。その判断は、この記録を一緒に確認する臨床医に委ねられます。",
};

export function pdfStrings(locale: Locale): PdfStrings {
  return locale === "ja" ? JA : EN;
}
