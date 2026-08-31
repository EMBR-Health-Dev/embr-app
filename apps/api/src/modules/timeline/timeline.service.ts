import type { TimelineEventDto } from "@embr/types";
import type { TimelineQuery } from "@embr/validation";
import { bucketSymptomLogsByWeek } from "./symptom-buckets.js";
import { timelineRepository } from "./timeline.repository.js";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whether an ISO date string falls within an optional [from, to]
 * range — used to filter treatment-started/ended events, since
 * listTreatmentsOverlappingRange fetches every treatment touching the
 * range at all (Milestone 18's overlap semantics), but a treatment
 * that started before `from` shouldn't produce a TREATMENT_STARTED
 * event dated before the window the person actually asked for. */
function isWithin(dateIso: string, from: Date | undefined, to: Date | undefined): boolean {
  if (from && dateIso < toIsoDate(from)) return false;
  if (to && dateIso > toIsoDate(to)) return false;
  return true;
}

/**
 * Merges three independently-sourced, entirely deterministic event
 * streams into one chronological timeline: weekly symptom summaries
 * (Stage 3 pattern detection — see symptom-buckets.ts), treatment
 * start/end markers, and brief-generation markers. No AI involvement
 * anywhere in this module — a BRIEF_GENERATED event links to a brief's
 * id rather than inlining its narrative, and nothing here interprets
 * what a symptom-count change or a treatment's timing means.
 *
 * Sort is by date ascending, and within the same date by a fixed type
 * order (symptom week, then treatment events, then briefs) so the
 * result is reproducible across requests — same requirement
 * detectSymptomCoOccurrence and bucketSymptomLogsByWeek both document
 * for themselves.
 */
const TYPE_ORDER: Record<TimelineEventDto["type"], number> = {
  SYMPTOM_WEEK: 0,
  TREATMENT_STARTED: 1,
  TREATMENT_ENDED: 2,
  BRIEF_GENERATED: 3,
};

export const timelineService = {
  async get(userId: string, query: TimelineQuery): Promise<TimelineEventDto[]> {
    const [symptomLogs, treatments, briefs] = await Promise.all([
      timelineRepository.symptomLogsForTimeline(userId, query),
      timelineRepository.listTreatmentsOverlappingRange(userId, query.from, query.to),
      timelineRepository.listBriefsGeneratedInRange(userId, query.from, query.to),
    ]);

    const events: TimelineEventDto[] = [];

    for (const week of bucketSymptomLogsByWeek(symptomLogs)) {
      if (week.totalCount === 0) continue; // an empty week isn't an "event"
      events.push({ type: "SYMPTOM_WEEK", date: week.weekStart, ...week });
    }

    for (const treatment of treatments) {
      const startDateIso = toIsoDate(treatment.startDate);
      if (isWithin(startDateIso, query.from, query.to)) {
        events.push({
          type: "TREATMENT_STARTED",
          date: startDateIso,
          treatmentId: treatment.id,
          name: treatment.name,
          category: treatment.category,
        });
      }

      if (treatment.endDate) {
        const endDateIso = toIsoDate(treatment.endDate);
        if (isWithin(endDateIso, query.from, query.to)) {
          events.push({
            type: "TREATMENT_ENDED",
            date: endDateIso,
            treatmentId: treatment.id,
            name: treatment.name,
            category: treatment.category,
          });
        }
      }
    }

    for (const brief of briefs) {
      events.push({
        type: "BRIEF_GENERATED",
        date: toIsoDate(brief.createdAt),
        briefId: brief.id,
        fromDate: toIsoDate(brief.fromDate),
        toDate: toIsoDate(brief.toDate),
      });
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

    return events;
  },
};
