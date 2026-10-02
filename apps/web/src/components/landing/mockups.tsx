import { useLocale, useTranslations } from "next-intl";

/**
 * Static, illustrative renderings of two real product surfaces — the
 * dashboard/Signals record and the EMBR BRIEF. Every label is pulled
 * from the product's own message namespaces (Brief, CoOccurrence,
 * Trends, Enums) rather than written for marketing, so these can't
 * drift into showing a capability the app doesn't have. The data is
 * sample data and the figure caption says so. Nothing in here is
 * interactive: "buttons" are plain text styled to match.
 */

const SAMPLE_DAYS: Array<{
  date: string;
  entries: Array<{ category: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
}> = [
  { date: "2026-06-02", entries: [{ category: "HEADACHE", severity: "MODERATE" }] },
  {
    date: "2026-06-03",
    entries: [
      { category: "SLEEP_DISTURBANCE", severity: "SEVERE" },
      { category: "HOT_FLASH", severity: "MODERATE" },
    ],
  },
  { date: "2026-06-04", entries: [{ category: "BRAIN_FOG", severity: "MILD" }] },
  { date: "2026-06-08", entries: [{ category: "FATIGUE", severity: "MODERATE" }] },
];

const SAMPLE_FREQUENCY = [
  { category: "SLEEP_DISTURBANCE", count: 14 },
  { category: "HOT_FLASH", count: 11 },
  { category: "BRAIN_FOG", count: 8 },
  { category: "FATIGUE", count: 6 },
] as const;

const SEVERITY_DOT: Record<string, string> = {
  MILD: "bg-lilac-300",
  MODERATE: "bg-lilac-500",
  SEVERE: "bg-graphite-700",
};

function Caption({ tone = "default" }: { tone?: "default" | "inverse" }) {
  const t = useTranslations("Landing");
  return (
    <figcaption
      className={`mt-3 text-caption ${tone === "inverse" ? "text-pearl-50/70" : "text-muted-foreground"}`}
    >
      {t("mockupCaption")}
    </figcaption>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-overline font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      {children}
    </p>
  );
}

export function RecordMockup() {
  const t = useTranslations("Landing.product.mockup");
  const tEnum = useTranslations("Enums");
  const tCo = useTranslations("CoOccurrence");
  const tTrends = useTranslations("Trends");
  const locale = useLocale();
  // Fixed UTC so a server render and any client render agree.
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const pair = {
    categoryA: tEnum("category.HOT_FLASH"),
    categoryB: tEnum("category.SLEEP_DISTURBANCE"),
  };

  return (
    <figure className="min-w-0">
      <div className="rounded-lg border border-border bg-background p-5 shadow-subtle sm:p-6">
        <PanelLabel>{t("timelineLabel")}</PanelLabel>
        <ul className="mt-4 divide-y divide-border-subtle">
          {SAMPLE_DAYS.map((day) => (
            <li key={day.date} className="flex gap-4 py-3">
              <span className="w-24 shrink-0 font-mono text-caption leading-6 text-muted-foreground">
                {fmt.format(new Date(`${day.date}T00:00:00Z`))}
              </span>
              <ul className="min-w-0 space-y-1">
                {day.entries.map((e) => (
                  <li key={e.category} className="flex flex-wrap items-center gap-x-2 text-body-s">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[e.severity]}`}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{tEnum(`category.${e.category}`)}</span>
                    <span className="text-muted-foreground">{tEnum(`severity.${e.severity}`)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded border border-lilac-300 bg-lilac-100 p-4">
          <PanelLabel>{tCo("cardLabel")}</PanelLabel>
          <p className="mt-2 font-display text-heading-m text-foreground">
            {tCo("findingHeading", pair)}
          </p>
          <p className="mt-1 text-body-s text-graphite-700">
            {tCo("sharedDaysCount", { days: 6 })}
          </p>
          <p className="mt-3 text-caption text-graphite-700">{tCo("caveat")}</p>
        </div>

        <div className="mt-5 border-t border-border-subtle pt-4">
          <PanelLabel>{t("cycleLabel")}</PanelLabel>
          <p className="mt-2 text-body-s text-graphite-700">
            {tTrends.rich("averagingDays", {
              days: 31,
              strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
            })}
          </p>
        </div>
      </div>
      <Caption />
    </figure>
  );
}

export function BriefMockup() {
  const t = useTranslations("Landing.brief.mockup");
  const tBrief = useTranslations("Brief");
  const tEnum = useTranslations("Enums");
  const tCo = useTranslations("CoOccurrence");
  const max = SAMPLE_FREQUENCY[0].count;
  const pair = {
    categoryA: tEnum("category.HOT_FLASH"),
    categoryB: tEnum("category.SLEEP_DISTURBANCE"),
  };

  return (
    <figure className="min-w-0">
      <div className="rounded-lg bg-pearl-50 p-5 text-foreground shadow-subtle sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
          <p className="font-display text-heading-l">{tBrief("title")}</p>
          <p className="font-mono text-caption text-muted-foreground">{t("range")}</p>
        </div>

        <div className="mt-5">
          <PanelLabel>{tBrief("symptomFrequency")}</PanelLabel>
          <ul className="mt-3 space-y-3">
            {SAMPLE_FREQUENCY.map((row) => (
              <li key={row.category} className="text-body-s">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{tEnum(`category.${row.category}`)}</span>
                  <span className="whitespace-nowrap text-caption text-muted-foreground">
                    {tBrief("occurrenceCount", { count: row.count })}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-lilac-100" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-lilac-500"
                    style={{ width: `${(row.count / max) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <PanelLabel>{tBrief("patternsNoticedTitle")}</PanelLabel>
          <p className="mt-2 text-body-s">{tBrief("coOccurrenceEntry", { ...pair, days: 6 })}</p>
          <p className="mt-2 text-caption font-medium text-graphite-700 underline underline-offset-2">
            {tBrief("viewEvidence")}
          </p>
        </div>

        <div className="mt-6">
          <PanelLabel>{tBrief("cycleSummary")}</PanelLabel>
          <p className="mt-2 text-body-s">{tBrief("averageCycleLength", { days: 31, count: 3 })}</p>
        </div>

        <div className="mt-6 rounded border border-border-subtle bg-lilac-100 p-4">
          <PanelLabel>{tBrief("questionsForGp")}</PanelLabel>
          <p className="mt-2 text-body-s">{tCo("questionText", pair)}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-caption text-muted-foreground">
            {tBrief("evidenceSourceSelfReported")}
          </span>
          <span className="rounded-sm bg-primary px-4 py-2 text-caption font-medium text-primary-foreground">
            {tBrief("downloadPdf")}
          </span>
        </div>
      </div>
      <Caption tone="inverse" />
    </figure>
  );
}
