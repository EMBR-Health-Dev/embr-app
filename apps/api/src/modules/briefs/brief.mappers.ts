import type { ClinicalBrief } from "../../generated/prisma/index.js";
import type {
  BriefCycleSummaryDto,
  BriefSymptomSummaryEntryDto,
  BriefTreatmentSummaryEntryDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
} from "@embr/types";

export function toClinicalBriefListItemDto(brief: ClinicalBrief): ClinicalBriefListItemDto {
  return {
    id: brief.id,
    fromDate: brief.fromDate.toISOString().slice(0, 10),
    toDate: brief.toDate.toISOString().slice(0, 10),
    createdAt: brief.createdAt.toISOString(),
  };
}

export function toClinicalBriefDto(brief: ClinicalBrief): ClinicalBriefDto {
  return {
    ...toClinicalBriefListItemDto(brief),
    symptomSummary: brief.symptomSummary as unknown as BriefSymptomSummaryEntryDto[],
    cycleSummary: brief.cycleSummary as unknown as BriefCycleSummaryDto,
    // PRISMA-SCHEMA-BOUNDARY: ClinicalBrief has no treatmentSummary
    // column yet — see the schema/migration note in
    // treatment-summary.ts. There is nothing on `brief` to read here
    // until that migration lands, so this is an explicit, honest empty
    // placeholder, not a computed value — for a *newly generated*
    // brief, brief.service.ts's generate() overrides this field with
    // the real, freshly-computed snapshot on the object it returns
    // (see the PRISMA-SCHEMA-BOUNDARY comment there). get() has no
    // other source and returns this placeholder until then.
    treatmentSummary: [] as BriefTreatmentSummaryEntryDto[],
    aiNarrative: brief.aiNarrative,
    aiDiscussionTopics: brief.aiDiscussionTopics as unknown as string[],
  };
}
