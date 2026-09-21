/**
 * A static, versioned Stage 4 reference library (see the
 * embr-clinical-logic skill doctrine) — general scientific/clinical
 * background on hot flashes, not a per-user computed interpretation.
 * Structurally the same discipline as stage4-interpretation.ts's
 * pattern -> fixed text mapping: every section here is authored and
 * sourced at design time, versioned, and rendered by Stage 5 (React,
 * not an LLM, in this case) without alteration. Nothing in this
 * module is generated, and nothing about a specific user's record
 * feeds into it — see hot-flash-reference-library.tsx for how it's
 * kept strictly separate from (and secondary to) the user's own
 * evidence in the co-occurrence card.
 *
 * Bump HOT_FLASH_REFERENCE_LIBRARY_VERSION whenever a section's
 * claims or sources change, so a future audit can tell which version
 * of this content a given user (or a screenshot, support ticket,
 * etc.) actually saw.
 *
 * The body text for each section lives in messages/{en,ja}.json under
 * HotFlashReferenceLibrary.sections.<id> — translatable prose belongs
 * there, not here. This module holds only the structure and the
 * source citations, which are not translated (a publisher name, a
 * document title, and a URL are the same fact in either locale).
 *
 * The Japanese body copy for this namespace describes mechanistic/
 * clinical content (KNDy neurons, NK3 receptor antagonism, etc.) at a
 * level of precision this session cannot get independently verified
 * by a native-speaking clinical reviewer. Treat it as a first-pass
 * translation, not production-ready, until that review happens.
 */
export const HOT_FLASH_REFERENCE_LIBRARY_VERSION = "1.0";

export interface ReferenceSource {
  /** Publisher or issuing body — e.g. "The Menopause Society", "NICE", "FDA", "PubMed". */
  publisher: string;
  /** The specific document/guideline/paper being cited. */
  title: string;
  /** Whatever version/date identifier is actually verifiable for this
   * source — a guideline number, a position-statement year, a PMID —
   * never a fabricated "last updated" date this module can't verify. */
  sourceVersion: string;
  url: string;
}

export type ReferenceSectionId =
  | "hormonal_signaling"
  | "kndy_nk3_pathway"
  | "neurotransmitter_pathways"
  | "behavioral_psychological"
  | "context_lifestyle"
  | "treatment_pathways";

export interface ReferenceSection {
  id: ReferenceSectionId;
  /** True only for the section that names actual treatment categories.
   * Its body copy is mechanism/category description, never a
   * recommendation — see the treatment_pathways body and caveat
   * strings in messages/{en,ja}.json's HotFlashReferenceLibrary
   * namespace, and the "not a recommendation" doctrine note above. */
  isTreatmentPathways?: boolean;
  sources: ReferenceSource[];
}

const NAMS_HORMONE_THERAPY: ReferenceSource = {
  publisher: "The Menopause Society",
  title: "Hormone Therapy",
  sourceVersion: "Menopause Topics patient education page",
  url: "https://menopause.org/patient-education/menopause-topics/hormone-therapy",
};

const NAMS_HOT_FLASHES: ReferenceSource = {
  publisher: "The Menopause Society",
  title: "Hot Flashes",
  sourceVersion: "Menopause Topics patient education page",
  url: "https://menopause.org/patient-education/menopause-topics/hot-flashes",
};

const NAMS_NONHORMONE_2023: ReferenceSource = {
  publisher: "The Menopause Society",
  title: "Nonhormone Therapy Position Statement",
  sourceVersion: "2023",
  url: "https://www.menopause.org/docs/default-source/professional/2023-nonhormone-therapy-position-statement.pdf",
};

const NAMS_HYPNOSIS_CBT: ReferenceSource = {
  publisher: "The Menopause Society",
  title:
    "Clinical Hypnosis vs. Cognitive Behavioral Therapy: What's Better for Managing Hot Flashes?",
  sourceVersion: "2024 scoping review summary",
  url: "https://menopause.org/press-releases/clinical-hypnosis-vs-cognitive-behavioral-therapy-whats-better-for-managing-hot-flashes",
};

const NICE_NG23: ReferenceSource = {
  publisher: "NICE",
  title: "Menopause: identification and management",
  sourceVersion: "Guideline NG23",
  url: "https://www.nice.org.uk/guidance/ng23/chapter/Recommendations",
};

const FDA_VEOZAH_APPROVAL: ReferenceSource = {
  publisher: "FDA",
  title: "FDA Approves Novel Drug to Treat Moderate to Severe Hot Flashes Caused by Menopause",
  sourceVersion: "2023 approval announcement",
  url: "https://www.fda.gov/news-events/press-announcements/fda-approves-novel-drug-treat-moderate-severe-hot-flashes-caused-menopause",
};

const FDA_VEOZAH_SAFETY: ReferenceSource = {
  publisher: "FDA",
  title:
    "FDA adds warning about rare occurrence of serious liver injury with use of Veozah (fezolinetant)",
  sourceVersion: "Drug safety communication",
  url: "https://www.fda.gov/drugs/drug-safety-communications/fda-adds-warning-about-rare-occurrence-serious-liver-injury-use-veozah-fezolinetant-hot-flashes-due",
};

const PUBMED_KNDY_NK3_REVIEW: ReferenceSource = {
  publisher: "PubMed",
  title:
    "Neurokinin receptor antagonists for vasomotor symptoms: from KNDy neurons to clinical translation",
  sourceVersion: "PMID 41981275, 2026 review",
  url: "https://pubmed.ncbi.nlm.nih.gov/41981275/",
};

const PUBMED_KNDY_HYPOTHESIS: ReferenceSource = {
  publisher: "PubMed",
  title:
    "Modulation of body temperature and LH secretion by hypothalamic KNDy (kisspeptin, neurokinin B and dynorphin) neurons: a novel hypothesis on the mechanism of hot flushes",
  sourceVersion: "PMID 23872331",
  url: "https://pubmed.ncbi.nlm.nih.gov/23872331/",
};

const PMC_TEMPERATURE_REGULATION: ReferenceSource = {
  publisher: "PubMed Central",
  title: "Effects of menopause on temperature regulation",
  sourceVersion: "PMC12051537",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12051537/",
};

export const HOT_FLASH_REFERENCE_SECTIONS: ReferenceSection[] = [
  {
    id: "hormonal_signaling",
    sources: [NAMS_HORMONE_THERAPY, PMC_TEMPERATURE_REGULATION],
  },
  {
    id: "kndy_nk3_pathway",
    sources: [PUBMED_KNDY_NK3_REVIEW, PUBMED_KNDY_HYPOTHESIS],
  },
  {
    id: "neurotransmitter_pathways",
    sources: [NAMS_NONHORMONE_2023],
  },
  {
    id: "behavioral_psychological",
    sources: [NICE_NG23, NAMS_HYPNOSIS_CBT],
  },
  {
    id: "context_lifestyle",
    sources: [NAMS_HOT_FLASHES],
  },
  {
    id: "treatment_pathways",
    isTreatmentPathways: true,
    sources: [
      NAMS_HORMONE_THERAPY,
      FDA_VEOZAH_APPROVAL,
      FDA_VEOZAH_SAFETY,
      NAMS_NONHORMONE_2023,
      NICE_NG23,
    ],
  },
];
