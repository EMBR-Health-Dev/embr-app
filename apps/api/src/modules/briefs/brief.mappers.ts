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
    treatmentSummary: brief.treatmentSummary as unknown as BriefTreatmentSummaryEntryDto[],
    aiNarrative: brief.aiNarrative,
    aiDiscussionTopics: brief.aiDiscussionTopics as unknown as string[],
  };
}
