import type { TrendsQuery } from "@embr/validation";
import type { CycleLengthTrendDto, SymptomCategory, SymptomFrequencyDto } from "@embr/types";
import { trendsRepository } from "./trends.repository.js";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const trendsService = {
  async symptomFrequency(userId: string, query: TrendsQuery): Promise<SymptomFrequencyDto[]> {
    const rows = await trendsRepository.symptomFrequency(userId, query);
    return rows
      .map((row) => ({ category: row.category as SymptomCategory, count: row.count }))
      .sort((a, b) => b.count - a.count);
  },

  async cycleLength(userId: string, query: TrendsQuery): Promise<CycleLengthTrendDto> {
    const starts = await trendsRepository.periodStartDates(userId, query);

    const lengths: CycleLengthTrendDto["lengths"] = [];
    for (let i = 1; i < starts.length; i++) {
      const prev = starts[i - 1]!.date;
      const curr = starts[i]!.date;
      const days = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      lengths.push({ from: toIsoDate(prev), to: toIsoDate(curr), days });
    }

    const averageDays =
      lengths.length > 0
        ? Math.round(lengths.reduce((sum, l) => sum + l.days, 0) / lengths.length)
        : null;

    return { averageDays, lengths };
  },
};
