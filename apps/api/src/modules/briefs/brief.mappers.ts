import type { ClinicalBrief } from "../../generated/prisma/index.js";
import type {
  BriefCycleSummaryDto,
  BriefFrequencyComparisonEntryDto,
  BriefSymptomSummaryEntryDto,
  BriefTreatmentImpactEntryDto,
  BriefTreatmentSummaryEntryDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  Stage4Result,
  SymptomCategory,
  SymptomCoOccurrenceDto,
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
    // Prisma returns a JS `null` for a NULL JSONB column exactly as
    // stored — no cast trickery needed for the "brief predates this
    // field" case the DTO's own doc comment describes.
    frequencyComparison: brief.frequencyComparison as unknown as
      BriefFrequencyComparisonEntryDto[] | null,
    // Unlike frequencyComparison, null here is intentionally
    // overloaded — see ClinicalBriefDto's own doc comment on this
    // field for why "never computed" and "computed, no qualifying
    // pair" are not distinguished for this field specifically.
    coOccurrence: brief.coOccurrence as unknown as SymptomCoOccurrenceDto | null,
    // Same null/empty-array distinction as frequencyComparison, not
    // coOccurrence — see ClinicalBriefDto's own doc comment.
    treatmentImpact: brief.treatmentImpact as unknown as BriefTreatmentImpactEntryDto[] | null,
    persistentSymptoms: brief.persistentSymptoms as unknown as SymptomCategory[] | null,
    // The canonical Stage 4 result, exactly as generation computed and
    // persisted it — including treatment names inside
    // treatment_window_changed patterns, safe here since this is the
    // UI/PDF-facing DTO, not what was sent to the AI (see
    // stage4-ai-projection.ts for that separate, name-stripped copy,
    // which is never itself persisted or returned via this mapper).
    interpretation: brief.interpretation as unknown as Stage4Result | null,
    aiNarrative: brief.aiNarrative,
    aiDiscussionTopics: brief.aiDiscussionTopics as unknown as string[],
  };
}
