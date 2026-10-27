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
  SLEEP_DISTURBANCE: "睡眠の乱れ",
  BRAIN_FOG: "ブレインフォグ",
  JOINT_PAIN: "関節痛",
  FATIGUE: "倦怠感",
  ANXIETY: "不安",
  IRREGULAR_HEARTBEAT: "脈の乱れ",
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
  aiAuthorshipNote: string;
  groundedInHeading: string;
  questionsHeading: string;
  symptomSignalsHeading: string;
  noSymptomsText: string;
  occurrenceLine: (count: number, severityBreakdown: string) => string;
  dayByDayHeading: string;
  dayByDayIntro: string;
  dayByDayLegendLogged: string;
  dayByDayLegendOther: string;
  dayByDayLegendNoEntry: string;
  dayByDayCoverage: (recorded: number, total: number) => string;
  comparedWithPreviousHeading: string;
  frequencyComparisonLine: (currentCount: number, previousCount: number) => string;
  ongoingSymptomsHeading: string;
  persistentSymptomLine: (category: string) => string;
  nightSweatsRecallHeading: string;
  nightSweatsAnsweredLine: (mornings: number) => string;
  nightSweatsBreakdownLine: (
    b: Record<"NONE" | "ONE" | "TWO_TO_THREE" | "FOUR_PLUS", number>,
  ) => string;
  nightSweatsFewAnswersNote: string;
  nightSweatsSeparateNote: string;
  workImpactHeading: string;
  workImpactAnsweredLine: (days: number) => string;
  workImpactBreakdownLine: (b: Record<"NONE" | "DID_LESS" | "MISSED_TIME", number>) => string;
  workImpactFewAnswersNote: string;
  workImpactPrivacyNote: string;
  exerciseHeading: string;
  exerciseAnsweredLine: (days: number) => string;
  exerciseBreakdownLine: (b: Record<"NONE" | "LIGHT" | "MODERATE" | "VIGOROUS", number>) => string;
  exerciseFewAnswersNote: string;
  exerciseScaleNote: string;
  mrsHeading: string;
  mrsCountLine: (count: number) => string;
  mrsPointLine: (
    date: string,
    scores: { total: number; somatic: number; psychological: number; urogenital: number },
    bands: { total: string; somatic: string; psychological: string; urogenital: string },
  ) => string;
  mrsBand: Record<"NONE_OR_LITTLE" | "MILD" | "MODERATE" | "SEVERE", string>;
  mrsScaleNote: string;
  mrsBandsNote: string;
  mrsCopyright: string;
  patternsNoticedHeading: string;
  coOccurrenceLine: (categoryA: string, categoryB: string, days: number) => string;
  cycleSummaryHeading: string;
  notEnoughCycleDataText: string;
  averageCycleLengthLine: (days: number, cycleCount: number) => string;
  periodDaysLoggedLine: (days: number) => string;
  lastPeriodDayLine: (date: string, months: number) => string;
  reportedLastPeriodLine: (date: string, months: number) => string;
  reportedLastPeriodNote: string;
  noPeriodDayLoggedText: string;
  lastPeriodDayNote: string;
  treatmentsHeading: string;
  noTreatmentsText: string;
  ongoingLabel: string;
  stopReasonLine: (
    reason: "SIDE_EFFECTS" | "LONG_TERM_CONCERN" | "NO_LONGER_NEEDED" | "COST" | "OTHER",
  ) => string;
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
  documentTitle: "EMBR BRIEF",
  observationPeriodLabel: "OBSERVATION PERIOD",
  preparedFor: (email) => `Prepared for ${email}`,
  generatedAt: (utcTimestamp) => `Generated ${utcTimestamp} UTC`,
  topDisclaimer:
    "This is a structured summary of self-tracked data, generated to help a conversation with a" +
    " healthcare provider. Not a diagnosis, and not medical advice.",
  summaryHeading: "Summary",
  aiAuthorshipNote:
    "This summary and the questions are written by AI from the counts and patterns in this brief. Your notes are not used.",
  groundedInHeading: "Grounded in your data",
  questionsHeading: "Questions to bring to your healthcare provider",
  symptomSignalsHeading: "Symptom Signals",
  noSymptomsText: "No symptoms logged in this range.",
  occurrenceLine: (count, severityBreakdown) =>
    `${count} occurrence${count === 1 ? "" : "s"} (${severityBreakdown})`,
  dayByDayHeading: "Day by day",
  dayByDayIntro:
    "Each column is one day of this BRIEF, oldest on the left. It shows which days each symptom was recorded, not how severe it was.",
  dayByDayLegendLogged: "Recorded",
  dayByDayLegendOther: "Other symptoms recorded",
  dayByDayLegendNoEntry: "No entry recorded",
  dayByDayCoverage: (recorded, total) => {
    const missing = total - recorded;
    return `Entries on ${recorded} of ${total} days. No entry recorded on ${missing} day${missing === 1 ? "" : "s"}.`;
  },
  comparedWithPreviousHeading: "Compared with the previous period",
  frequencyComparisonLine: (currentCount, previousCount) =>
    `Logged ${currentCount} time${currentCount === 1 ? "" : "s"}, compared with` +
    ` ${previousCount} time${previousCount === 1 ? "" : "s"} in the previous period.`,
  ongoingSymptomsHeading: "Ongoing symptoms",
  persistentSymptomLine: (category) => `${category} remained present across both periods.`,
  nightSweatsRecallHeading: "Night sweats recalled in the morning",
  nightSweatsAnsweredLine: (mornings) =>
    `Answered on ${mornings} morning${mornings === 1 ? "" : "s"} in this period.`,
  nightSweatsBreakdownLine: (b) =>
    `None on ${b.NONE}, 1 on ${b.ONE}, 2 to 3 on ${b.TWO_TO_THREE}, 4 or more on ${b.FOUR_PLUS}.`,
  nightSweatsFewAnswersNote: "A breakdown is shown once 7 mornings have been answered.",
  nightSweatsSeparateNote: "These are morning estimates, counted separately from logged symptoms.",
  workImpactHeading: "Days symptoms affected work",
  workImpactAnsweredLine: (days) =>
    `Answered on ${days} day${days === 1 ? "" : "s"} in this period.`,
  workImpactBreakdownLine: (b) =>
    `No effect on ${b.NONE}, did less on ${b.DID_LESS}, missed time on ${b.MISSED_TIME}.`,
  workImpactFewAnswersNote: "A breakdown is shown once 7 days have been answered.",
  workImpactPrivacyNote: "Her own daily answers. Never shared with any employer.",
  exerciseHeading: "Exercise",
  exerciseAnsweredLine: (days) => `Answered on ${days} day${days === 1 ? "" : "s"} in this period.`,
  exerciseBreakdownLine: (b) =>
    `None on ${b.NONE}, light on ${b.LIGHT}, moderate on ${b.MODERATE}, vigorous on ${b.VIGOROUS}.`,
  exerciseFewAnswersNote: "A breakdown is shown once 7 days have been answered.",
  exerciseScaleNote: "Her own judgement of how hard she exercised each day, not measured.",
  mrsHeading: "Menopause Rating Scale (MRS)",
  mrsCountLine: (count) =>
    count === 1
      ? "1 monthly rating in this period."
      : `${count} monthly ratings in this period; the first and latest are shown.`,
  mrsPointLine: (date, s, b) =>
    `${date}: total ${s.total} of 44 (${b.total}); somatic ${s.somatic} of 16 (${b.somatic}), ` +
    `psychological ${s.psychological} of 16 (${b.psychological}), urogenital ${s.urogenital} of 12 (${b.urogenital}).`,
  mrsBand: {
    NONE_OR_LITTLE: "none or little",
    MILD: "mild",
    MODERATE: "moderate",
    SEVERE: "severe",
  },
  mrsScaleNote:
    "Her own ratings of 11 symptoms, each from 0 (none) to 4 (extremely severe), for how she felt at the time.",
  mrsBandsNote:
    "Bands in brackets are the published MRS reference categories (Heinemann et al. 2004), from a German population sample; scores tend to run lower in Asian samples. They describe a score, not a diagnosis.",
  mrsCopyright: "Menopause Rating Scale © Prof. Lothar A. J. Heinemann.",
  patternsNoticedHeading: "Observed patterns",
  coOccurrenceLine: (categoryA, categoryB, days) =>
    `${categoryA} and ${categoryB} were both reported on the same day on ${days}` +
    ` occasion${days === 1 ? "" : "s"}.`,
  cycleSummaryHeading: "Cycle summary",
  notEnoughCycleDataText: "Not enough period-start entries in this range to compute cycle length.",
  averageCycleLengthLine: (days, cycleCount) =>
    `Average cycle length: ${days} days (${cycleCount} cycle${cycleCount === 1 ? "" : "s"} recorded)`,
  periodDaysLoggedLine: (days) => `${days} period day${days === 1 ? "" : "s"} logged`,
  lastPeriodDayLine: (date, months) =>
    `Last period day logged: ${date} (${
      months === 0 ? "less than a month" : `${months} month${months === 1 ? "" : "s"}`
    } before the end of this BRIEF)`,
  noPeriodDayLoggedText: "No period days logged in EMBR up to the end of this BRIEF.",
  lastPeriodDayNote: "Counts only period days logged in EMBR, across the whole record.",
  reportedLastPeriodLine: (date, months) =>
    `Last period, as she reported it in Settings: ${date} (${
      months === 0 ? "less than a month" : `${months} month${months === 1 ? "" : "s"}`
    } before the end of this BRIEF)`,
  reportedLastPeriodNote:
    "Her own answer in Settings, not a period day logged in EMBR. It may be approximate.",
  treatmentsHeading: "Treatments logged during this period",
  noTreatmentsText: "No treatments logged in this range.",
  ongoingLabel: "Ongoing",
  stopReasonLine: (reason) =>
    `Her reason for stopping: ${
      {
        SIDE_EFFECTS: "side effects",
        LONG_TERM_CONCERN: "concern about long-term effects",
        NO_LONGER_NEEDED: "no longer needed",
        COST: "cost",
        OTHER: "another reason",
      }[reason]
    }`,
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
  preparedFor: (email) => `記録者：${email}`,
  generatedAt: (utcTimestamp) => `作成日時：${utcTimestamp} UTC`,
  // Reused verbatim from Brief.description's own already-reviewed JA
  // text rather than translated fresh — this PDF line and the web
  // page's own description say almost the same thing in English
  // already (pre-existing, minor wording drift this task doesn't
  // reconcile — see EN.topDisclaimer above); reusing the vetted
  // translation guarantees identical safety framing instead of two
  // independently-worded Japanese versions of the same disclaimer.
  topDisclaimer:
    "あなたの記録を整理した要約に、担当医との会話に使える質問を添えたものです。これは会話の材料となる" +
    "データ要約であり、診断や医学的助言ではありません。",
  // "要約" (native Japanese "summary"), not "サマリー" — avoids reading
  // as a near-homophone of "BRIEF" itself inside the same document.
  summaryHeading: "要約",
  aiAuthorshipNote:
    "この要約と質問は、このBRIEF内の記録件数とパターンをもとにAIが作成したものです。メモの内容は使用していません。",
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
  dayByDayHeading: "日ごとの記録",
  dayByDayIntro:
    "1列が1日を表し、左が最も古い日です。各症状が記録された日を示し、重症度は示しません。",
  dayByDayLegendLogged: "記録あり",
  dayByDayLegendOther: "ほかの症状の記録あり",
  dayByDayLegendNoEntry: "記録なし",
  dayByDayCoverage: (recorded, total) =>
    `${total}日中${recorded}日に記録があります。記録なしは${total - recorded}日です。`,
  comparedWithPreviousHeading: "前回の期間との比較",
  frequencyComparisonLine: (currentCount, previousCount) =>
    `今回の期間に${currentCount}回記録され、前回の期間は${previousCount}回でした。`,
  ongoingSymptomsHeading: "継続している症状",
  persistentSymptomLine: (category) => `${category}は両方の期間で継続して記録されました。`,
  nightSweatsRecallHeading: "朝に振り返った昨夜の寝汗",
  nightSweatsAnsweredLine: (mornings) => `この期間に${mornings}日の朝に回答がありました。`,
  nightSweatsBreakdownLine: (b) =>
    `なし${b.NONE}日、1回${b.ONE}日、2〜3回${b.TWO_TO_THREE}日、4回以上${b.FOUR_PLUS}日。`,
  nightSweatsFewAnswersNote: "回答が7日分以上になると、内訳を表示します。",
  nightSweatsSeparateNote: "朝のおおよその回答で、症状の記録件数とは別に数えています。",
  workImpactHeading: "症状が仕事に影響した日",
  workImpactAnsweredLine: (days) => `この期間に${days}日分の回答がありました。`,
  workImpactBreakdownLine: (b) =>
    `影響なし${b.NONE}日、仕事量が減った${b.DID_LESS}日、休んだ・早退した${b.MISSED_TIME}日。`,
  workImpactFewAnswersNote: "回答が7日分以上になると、内訳を表示します。",
  workImpactPrivacyNote: "本人による毎日の回答です。勤務先と共有されることはありません。",
  exerciseHeading: "運動",
  exerciseAnsweredLine: (days) => `この期間に${days}日分の回答がありました。`,
  exerciseBreakdownLine: (b) =>
    `なし${b.NONE}日、軽い${b.LIGHT}日、中程度${b.MODERATE}日、激しい${b.VIGOROUS}日。`,
  exerciseFewAnswersNote: "回答が7日分以上になると、内訳を表示します。",
  exerciseScaleNote: "毎日どのくらい運動したかについての本人の判断で、測定値ではありません。",
  mrsHeading: "Menopause Rating Scale（MRS）",
  mrsCountLine: (count) =>
    count === 1
      ? "この期間の月1回の評価：1回。"
      : `この期間の月1回の評価：${count}回。最初と最新を表示しています。`,
  mrsPointLine: (date, s, b) =>
    `${date}：合計 ${s.total}／44（${b.total}）、身体 ${s.somatic}／16（${b.somatic}）、` +
    `心理 ${s.psychological}／16（${b.psychological}）、泌尿生殖器 ${s.urogenital}／12（${b.urogenital}）。`,
  mrsBand: { NONE_OR_LITTLE: "なし・軽微", MILD: "軽度", MODERATE: "中等度", SEVERE: "重度" },
  mrsScaleNote:
    "11の症状について、その時点の状態を0（なし）から4（非常に重い）で本人が評価したものです。",
  mrsBandsNote:
    "括弧内は公表されているMRSの参照区分（Heinemann他、2004年、ドイツの一般集団の標本）です。アジアの標本では点数が低めになる傾向があります。点数の位置づけを示すもので、診断ではありません。",
  mrsCopyright: "Menopause Rating Scale © Prof. Lothar A. J. Heinemann.",
  patternsNoticedHeading: "記録に見られるパターン",
  coOccurrenceLine: (categoryA, categoryB, days) =>
    `${categoryA}と${categoryB}が同じ日に記録された日は${days}日でした。`,
  cycleSummaryHeading: "周期の要約",
  notEnoughCycleDataText: "この期間の周期の長さを計算するには、生理開始日の記録が不足しています。",
  averageCycleLengthLine: (days, cycleCount) => `平均周期：${days}日（${cycleCount}周期記録あり）`,
  periodDaysLoggedLine: (days) => `記録された生理日数：${days}日`,
  lastPeriodDayLine: (date, months) =>
    `最後に記録された生理日：${date}（${
      months === 0 ? "このBRIEFの終了日から1か月以内" : `このBRIEFの終了日の${months}か月前`
    }）`,
  noPeriodDayLoggedText: "このBRIEFの終了日までに、EMBRに記録された生理日はありません。",
  lastPeriodDayNote: "EMBRに記録された生理日のみを、記録全体から数えています。",
  reportedLastPeriodLine: (date, months) =>
    `最後の生理（本人が設定で回答）：${date}（${
      months === 0 ? "このBRIEFの終了日から1か月以内" : `このBRIEFの終了日の${months}か月前`
    }）`,
  reportedLastPeriodNote:
    "本人が設定で回答した日付で、EMBRに記録された生理日ではありません。おおよその日付の場合があります。",
  treatmentsHeading: "この期間に記録された治療",
  noTreatmentsText: "この期間に記録された治療はありません。",
  ongoingLabel: "継続中",
  stopReasonLine: (reason) =>
    `中止の理由：${
      {
        SIDE_EFFECTS: "副作用",
        LONG_TERM_CONCERN: "長期的な影響への不安",
        NO_LONGER_NEEDED: "必要がなくなった",
        COST: "費用",
        OTHER: "その他の理由",
      }[reason]
    }`,
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
    "上記はすべて、記録された内容と、該当箇所で示された記録データ内のパターンを反映したものです。" +
    "これらは臨床的な解釈や診断ではありません。その判断は、この記録を一緒に確認する臨床医に委ねられます。",
};

export function pdfStrings(locale: Locale): PdfStrings {
  return locale === "ja" ? JA : EN;
}
