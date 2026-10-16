import { describe, expect, it } from "vitest";
import type { ClinicalBriefDto } from "@embr/types";
import { PDFParse } from "pdf-parse";
import { buildClinicalBriefPdf } from "../src/modules/briefs/brief.pdf.js";

/**
 * Regression coverage for a confirmed, reproduced bug: PDFKit's
 * built-in "Helvetica"/"Helvetica-Bold" fonts (WinAnsiEncoding, Latin-1
 * only) throw no exception on non-Latin-1 text, but silently corrupt
 * it — verified directly, before any fix existed, by rendering a
 * Japanese treatment name through the unmodified renderer and
 * extracting the actual PDF text: it came back as
 * "0¨0¹0È0é0¸0ª0ü0ëŒ¼NØRd", not the original string. EMBR is a
 * bilingual English/Japanese product, and treatment names are
 * free-text user input, so this was a real, reachable path — not a
 * hypothetical one. These tests exercise the real, fixed rendering
 * path end to end (PDFKit → buffer → pdf-parse) rather than only
 * asserting that generation doesn't throw, which the old, broken code
 * also satisfied.
 */

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

async function extractPdfText(doc: PDFKit.PDFDocument): Promise<string> {
  const bufferPromise = collectPdfBuffer(doc);
  doc.end();
  const buffer = await bufferPromise;
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

function baseBrief(overrides: Partial<ClinicalBriefDto> = {}): ClinicalBriefDto {
  return {
    id: "brief-1",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    createdAt: "2026-02-01T12:00:00.000Z",
    symptomSummary: [],
    cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
    treatmentSummary: [],
    frequencyComparison: null,
    coOccurrence: null,
    treatmentImpact: null,
    persistentSymptoms: null,
    nightSweatsRecall: null,
    workImpact: null,
    lastRecordedPeriod: null,
    interpretation: null,
    citedPatternIds: null,
    aiNarrative: "No significant patterns were noted in this period.",
    aiDiscussionTopics: ["Any new symptoms since the last visit?"],
    locale: "en",
    ...overrides,
  };
}

describe("buildClinicalBriefPdf — Unicode rendering", () => {
  it("renders a Japanese treatment name correctly, not corrupted", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        {
          name: "エストラジオール貼付剤",
          category: "HRT",
          startDate: "2026-01-01",
          endDate: null,
        },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("エストラジオール貼付剤");
    // The confirmed pre-fix failure mode — guards against a
    // regression back to the exact garbled output that was actually
    // produced, not just "some corruption or other."
    expect(text).not.toContain("0¨0¹0È0é0¸0ª0ü0ëŒ¼NØRd");
  });

  it("renders a mixed Japanese/English treatment name correctly", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        {
          name: "Treatment: エストラジオール",
          category: "HRT",
          startDate: "2026-01-01",
          endDate: null,
        },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Treatment: エストラジオール");
  });

  it("renders Japanese punctuation and full-width characters correctly", async () => {
    const brief = baseBrief({
      aiDiscussionTopics: ["症状の変化はありましたか？（はい・いいえ）"],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("症状の変化はありましたか？（はい・いいえ）");
  });

  it("renders accented Latin characters correctly", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        { name: "Œstrogène — café", category: "HRT", startDate: "2026-01-01", endDate: null },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Œstrogène — café");
  });

  it("still renders ordinary English content correctly with the new font", async () => {
    const brief = baseBrief({
      symptomSummary: [{ category: "HOT_FLASH", count: 3, severityBreakdown: { MODERATE: 3 } }],
      treatmentSummary: [
        { name: "Estradiol patch", category: "HRT", startDate: "2026-01-01", endDate: null },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Estradiol patch");
    expect(text).toContain("Hot Flash");
    expect(text).toContain("No significant patterns were noted in this period.");
  });

  it("generates a minimal, empty-data brief without throwing, with all empty-state text intact", async () => {
    const brief = baseBrief();

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("No symptoms logged in this range.");
    expect(text).toContain("No treatments logged in this range.");
    expect(text).toContain(
      "Not enough period-start entries in this range to compute cycle length.",
    );
  });
});

describe("buildClinicalBriefPdf — Japanese locale", () => {
  it("renders every static label in Japanese for a sparse, empty-data brief — no English label leaks in", async () => {
    const brief = baseBrief({
      locale: "ja",
      aiNarrative: "この期間に大きなパターンは見られませんでした。",
      aiDiscussionTopics: ["前回の受診以降、新しい症状はありますか？"],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    // Dates are plain ISO strings, not localized further (see
    // brief-locale.ts's own scope note) — confirmed unmangled here,
    // not just assumed, since this is the one piece of every Japanese
    // section that isn't itself Japanese text.
    expect(text).toContain(`${brief.fromDate}`);
    expect(text).toContain(`${brief.toDate}`);
    // Document identity — "EMBR BRIEF," not a fresh "Clinical Brief"
    // translation (see brief-locale.ts's own doc comment on why).
    expect(text).toContain("EMBR BRIEF");
    expect(text).toContain("観察期間");
    expect(text).toContain("要約");
    expect(text).toContain("担当医への質問");
    expect(text).toContain("症状の頻度");
    expect(text).toContain("この期間に記録された症状はありません。");
    expect(text).toContain("周期の要約");
    expect(text).toContain(
      "この期間の周期の長さを計算するには、生理開始日の記録が不足しています。",
    );
    expect(text).toContain("この期間に記録された治療");
    expect(text).toContain("この期間に記録された治療はありません。");
    expect(text).toContain(
      "上記はすべて、記録された内容と、該当箇所で示された記録データ内のパターンを反映したものです。",
    );
    // The English section headings and empty-state strings must be
    // fully absent, not merely joined by Japanese ones.
    expect(text).not.toContain("Clinical Brief");
    expect(text).not.toContain("OBSERVATION PERIOD");
    expect(text).not.toContain("No symptoms logged in this range.");
    expect(text).not.toContain("No treatments logged in this range.");
  });

  it("renders Japanese glyphs correctly in every dynamic section for a fully-populated brief, with correct localized category/severity/treatment labels", async () => {
    const brief = baseBrief({
      locale: "ja",
      symptomSummary: [
        { category: "HOT_FLASH", count: 6, severityBreakdown: { MODERATE: 4, SEVERE: 2 } },
      ],
      frequencyComparison: [
        {
          category: "HOT_FLASH",
          currentCount: 6,
          previousCount: 4,
          absoluteChange: 2,
          percentageChange: 50,
          direction: "increased",
        },
      ],
      persistentSymptoms: ["HOT_FLASH"],
      coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
      cycleSummary: { averageCycleLengthDays: 28, cycleCount: 3, periodDaysLogged: 15 },
      treatmentSummary: [
        { name: "エストラジオール貼付剤", category: "HRT", startDate: "2026-01-10", endDate: null },
      ],
      treatmentImpact: [
        {
          treatmentId: "t1",
          name: "エストラジオール貼付剤",
          category: "HRT",
          windowDays: 14,
          before: { logCount: 2, days: 14 },
          after: { logCount: 5, days: 14 },
          insufficientData: false,
        },
      ],
      citedPatternIds: ["co_occurrence_detected:BRAIN_FOG:HOT_FLASH"],
      interpretation: {
        interpretationVersion: "1.0",
        patterns: [
          {
            id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
            type: "co_occurrence_detected",
            observation: "ブレインフォグとホットフラッシュは、この期間中にどちらも報告されました。",
            association: "同じ日に報告されたのは4日です。",
            interpretation:
              "これは、2つの症状が同じ日に起こる傾向があることを示しています。一方が他方の原因であることを示すものではありません。",
            caveat: "これは時間的な関連性を示すものにすぎず、因果関係を示すものではありません。",
            confidence: "descriptive",
            evidenceRef: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH" },
          },
        ],
      },
      aiNarrative:
        "ホットフラッシュは今回の期間に6回報告され、前回の期間の4回よりも増加しました。ブレインフォグとの併発も見られました。",
      aiDiscussionTopics: ["この頻度の変化はこの時期によくあるパターンですか？"],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    // Category labels — the real Enums.category JA lookup, not the raw
    // enum value leaking through anywhere in the document.
    expect(text).toContain("ホットフラッシュ");
    expect(text).toContain("ブレインフォグ");
    expect(text).not.toContain("HOT_FLASH");
    expect(text).not.toContain("BRAIN_FOG");
    // Severity labels.
    expect(text).toContain("中等度");
    expect(text).toContain("重度");
    // Treatment category label, HRT special-case included.
    expect(text).toContain("HRT（ホルモン補充療法）");
    // User-entered Japanese free text (treatment name) — same Unicode
    // font path the existing "renders a Japanese treatment name"
    // English-locale test above already exercises, confirmed intact
    // here too, not just for ASCII-labeled documents.
    expect(text).toContain("エストラジオール貼付剤");
    // The treatment's start date, embedded directly inside an
    // otherwise-Japanese line — confirms dates stay intact and
    // unmangled when surrounded by Japanese text, not just at the
    // top-level masthead.
    expect(text).toContain("2026-01-10");
    // Section headings.
    expect(text).toContain("前回の期間との比較");
    expect(text).toContain("継続している症状");
    expect(text).toContain("記録に見られるパターン");
    expect(text).toContain("治療開始後の変化");
    expect(text).toContain("データに基づく根拠");
    // Dynamic sentence templates.
    expect(text).toContain("平均周期：28日（3周期記録あり）");
    expect(text).toContain("記録された生理日数：15日");
    // AI-generated content, rendered exactly as persisted. Checked as
    // two separate substrings, not one long span — PDFKit line-wraps
    // this sentence mid-way, same as any long line, so a single
    // contiguous match would be sensitive to exactly where the wrap
    // lands rather than to whether the content is actually present.
    expect(text).toContain("前回の期間の4回よりも増加しました");
    expect(text.replace(/\s+/g, "")).toContain("ブレインフォグとの併発も見られました");
    expect(text).toContain("この頻度の変化はこの時期によくあるパターンですか？");
    // No mojibake/tofu placeholder and no leftover English section
    // headings anywhere in a fully Japanese document.
    expect(text).not.toContain("Compared with the previous period");
    expect(text).not.toContain("Ongoing symptoms");
  });

  it("falls back to English when locale is missing from the DTO — defensive, not a real post-migration case", async () => {
    // Every real row has `locale` (the migration backfills a NOT NULL
    // DEFAULT 'en' for every existing row), so this can only happen
    // from a hand-built object bypassing the type system — exactly
    // what this constructs, to prove the `brief.locale ?? "en"`
    // fallback in buildClinicalBriefPdf actually does something.
    const brief = baseBrief();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately simulating a DTO missing the field, see comment above
    delete (brief as any).locale;

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    // Both locales now title the document "EMBR BRIEF", so an
    // English-only line stands in as the proof of the English fallback.
    expect(text).toContain("written by AI");
    expect(text).toContain("No symptoms logged in this range.");
  });
});

describe("buildClinicalBriefPdf — night sweats recalled in the morning", () => {
  it("states answered mornings and holds back the breakdown below 7", async () => {
    const brief = baseBrief({ nightSweatsRecall: { morningsAnswered: 3, breakdown: null } });
    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));
    expect(text).toContain("Answered on 3 mornings in this period.");
    expect(text).toContain("A breakdown is shown once 7 mornings have been answered.");
    expect(text).toContain("counted separately from logged symptoms");
  });

  it("gives the breakdown in Japanese from 7 answered mornings", async () => {
    const brief = baseBrief({
      locale: "ja",
      nightSweatsRecall: {
        morningsAnswered: 8,
        breakdown: { NONE: 2, ONE: 3, TWO_TO_THREE: 2, FOUR_PLUS: 1 },
      },
    });
    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));
    expect(text).toContain("朝に振り返った昨夜の寝汗");
    expect(text).toContain("なし2日、1回3日、2〜3回2日、4回以上1日。");
  });

  it("leaves the section out when no morning was answered", async () => {
    const brief = baseBrief({ nightSweatsRecall: { morningsAnswered: 0, breakdown: null } });
    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));
    expect(text).not.toContain("Answered on");
    expect(text).not.toContain("counted separately from logged symptoms");
  });
});

describe("buildClinicalBriefPdf — days symptoms affected work", () => {
  it("states answered days, holds back the breakdown below 7, and says it is never shared with an employer", async () => {
    const brief = baseBrief({ workImpact: { daysAnswered: 4, breakdown: null } });
    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));
    expect(text).toContain("Answered on 4 days in this period.");
    expect(text).toContain("A breakdown is shown once 7 days have been answered.");
    expect(text).toContain("Never shared with any employer.");
  });

  it("gives the breakdown in Japanese from 7 answered days", async () => {
    const brief = baseBrief({
      locale: "ja",
      workImpact: { daysAnswered: 9, breakdown: { NONE: 5, DID_LESS: 3, MISSED_TIME: 1 } },
    });
    const text = (await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"))).replace(
      /\s+/g,
      "",
    );
    expect(text).toContain("症状が仕事に影響した日");
    expect(text).toContain("影響なし5日、仕事量が減った3日、休んだ・早退した1日。");
    expect(text).toContain("勤務先と共有されることはありません。");
  });

  it("leaves the section out when no day was answered", async () => {
    const brief = baseBrief({ workImpact: { daysAnswered: 0, breakdown: null } });
    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));
    expect(text).not.toContain("employer");
  });
});

describe("buildClinicalBriefPdf — last period day logged", () => {
  it("prints the date and months before the BRIEF's end, in English and Japanese", async () => {
    const lastRecordedPeriod = { date: "2025-03-10", monthsBeforeBriefEnd: 10 };
    const en = await extractPdfText(
      buildClinicalBriefPdf(baseBrief({ lastRecordedPeriod }), "person@embr.health"),
    );
    expect(en).toContain(
      "Last period day logged: 2025-03-10 (10 months before the end of this BRIEF)",
    );
    expect(en).toContain("Counts only period days logged in EMBR, across the whole record.");

    const ja = (
      await extractPdfText(
        buildClinicalBriefPdf(
          baseBrief({ locale: "ja", lastRecordedPeriod }),
          "person@embr.health",
        ),
      )
    ).replace(/\s+/g, "");
    expect(ja).toContain("最後に記録された生理日：2025-03-10（このBRIEFの終了日の10か月前）");
  });

  it("labels a date she reported in Settings as her own answer", async () => {
    const text = await extractPdfText(
      buildClinicalBriefPdf(
        baseBrief({
          lastRecordedPeriod: { date: "2025-01-10", monthsBeforeBriefEnd: 12, source: "reported" },
        }),
        "person@embr.health",
      ),
    );
    expect(text).toContain(
      "Last period, as she reported it in Settings: 2025-01-10 (12 months before the end of this BRIEF)",
    );
    expect(text).toContain("Her own answer in Settings, not a period day logged in EMBR.");
    expect(text).not.toContain("Last period day logged");
  });

  it("says when none was logged, and prints nothing for a BRIEF made before this existed", async () => {
    const none = await extractPdfText(
      buildClinicalBriefPdf(
        baseBrief({ lastRecordedPeriod: { date: null, monthsBeforeBriefEnd: null } }),
        "person@embr.health",
      ),
    );
    expect(none).toContain("No period days logged in EMBR up to the end of this BRIEF.");

    const older = await extractPdfText(buildClinicalBriefPdf(baseBrief(), "person@embr.health"));
    expect(older).not.toContain("Last period day logged");
    expect(older).not.toContain("No period days logged");
  });
});

describe("buildClinicalBriefPdf — her reason for stopping a treatment", () => {
  it("prints the reason under an ended treatment, in English and Japanese", async () => {
    const entry = {
      name: "Estradiol patch",
      category: "HRT" as const,
      startDate: "2026-01-05",
      endDate: "2026-01-20",
      stopReason: "LONG_TERM_CONCERN" as const,
    };
    const en = await extractPdfText(
      buildClinicalBriefPdf(baseBrief({ treatmentSummary: [entry] }), "person@embr.health"),
    );
    expect(en).toContain("Her reason for stopping: concern about long-term effects");

    const ja = (
      await extractPdfText(
        buildClinicalBriefPdf(
          baseBrief({ locale: "ja", treatmentSummary: [entry] }),
          "person@embr.health",
        ),
      )
    ).replace(/\s+/g, "");
    expect(ja).toContain("中止の理由：長期的な影響への不安");
  });

  it("prints nothing extra when no reason was given", async () => {
    const text = await extractPdfText(
      buildClinicalBriefPdf(
        baseBrief({
          treatmentSummary: [
            {
              name: "Magnesium",
              category: "SUPPLEMENT",
              startDate: "2026-01-05",
              endDate: "2026-01-20",
            },
          ],
        }),
        "person@embr.health",
      ),
    );
    expect(text).not.toContain("reason for stopping");
  });
});
