/** "50%" from 0.5, or a dash when there is nothing to divide by. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** "Oct 6" for a YYYY-MM-DD week start, read as a UTC date. */
export function formatWeek(isoDate: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** A count with a share of a total, e.g. "12 of 40". */
export function ofTotal(part: number, total: number): string {
  return `${part.toLocaleString()} of ${total.toLocaleString()}`;
}
