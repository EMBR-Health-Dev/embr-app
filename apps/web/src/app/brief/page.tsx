"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  BriefTrendsDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  Stage4Pattern,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { AppNav } from "../../components/app-nav";
import { EmailVerificationRequired } from "../../components/email-verification-required";
import { endOfLocalDay, startOfLocalDay } from "../../lib/date-format";

function BriefPageContent() {
  const t = useTranslations("Brief");
  const tCommon = useTranslations("Common");
  const tEnum = useTranslations("Enums");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, logout } = useAuth();
  const [managesOrg, setManagesOrg] = useState(false);

  // Lets a link from Signals (see co-occurrence-card.tsx's briefCta)
  // land with the same period already filled in, rather than making
  // someone re-pick dates they just saw on screen a moment ago. Only
  // ever an initial value — never re-synced from the URL after that,
  // so typing into the fields behaves exactly as it did before this.
  const [fromDate, setFromDate] = useState(() => searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(() => searchParams.get("to") ?? "");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateNeedsVerification, setGenerateNeedsVerification] = useState(false);
  const [justGenerated, setJustGenerated] = useState<ClinicalBriefDto | null>(null);

  const [history, setHistory] = useState<ClinicalBriefListItemDto[] | null>(null);
  const [openBriefId, setOpenBriefId] = useState<string | null>(null);
  const [openBrief, setOpenBrief] = useState<ClinicalBriefDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [briefDetailError, setBriefDetailError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [trends, setTrends] = useState<BriefTrendsDto | null>(null);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [summaryDownloadError, setSummaryDownloadError] = useState<string | null>(null);
  const [summaryNeedsVerification, setSummaryNeedsVerification] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  function loadHistory() {
    api.briefs.list({ pageSize: 20 }).then((page) => setHistory(page.items));
  }

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  useEffect(() => {
    // Independent of loadHistory — evidence aggregation over the
    // user's own recent briefs, not tied to the paginated history
    // list's own loading state or page size.
    if (user) api.briefs.trends().then(setTrends);
  }, [user]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerateError(null);
    setGenerateNeedsVerification(false);

    if (!fromDate || !toDate) {
      setGenerateError(t("pickDates"));
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({
        fromDate: startOfLocalDay(fromDate),
        toDate: endOfLocalDay(toDate),
      });
      setJustGenerated(brief);
      loadHistory();
      api.briefs.trends().then(setTrends);
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setGenerateNeedsVerification(true);
      } else {
        setGenerateError(err instanceof ApiError ? err.message : t("generateError"));
      }
    } finally {
      setGenerating(false);
    }
  }

  // The clinician-summary PDF (raw symptom/cycle/treatment data, no AI
  // narrative) is a different document from the brief's own PDF above
  // — see docs/openapi.yaml's /export/summary.pdf description. Scoped
  // to the same fromDate/toDate the brief was just generated for, so
  // the person doesn't have to re-enter a range they already picked on
  // the separate /export page.
  async function handleDownloadSummary(brief: ClinicalBriefDto) {
    setSummaryDownloadError(null);
    setSummaryNeedsVerification(false);
    setDownloadingSummary(true);
    try {
      const blob = await api.export.clinicianSummaryPdf({ from: brief.fromDate, to: brief.toDate });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "embr-health-summary.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setSummaryNeedsVerification(true);
      } else {
        setSummaryDownloadError(err instanceof ApiError ? err.message : t("downloadSummaryError"));
      }
    } finally {
      setDownloadingSummary(false);
    }
  }

  async function toggleBrief(id: string) {
    if (openBriefId === id) {
      setOpenBriefId(null);
      setOpenBrief(null);
      return;
    }
    setOpenBriefId(id);
    setOpenBrief(null);
    setBriefDetailError(null);
    try {
      const brief = await api.briefs.get(id);
      setOpenBrief(brief);
    } catch (err) {
      // Without this, a failed fetch left openBriefId set with
      // openBrief still null — the "loading…" placeholder below never
      // resolves, a permanent spinner rather than a real failure.
      setOpenBriefId(null);
      setBriefDetailError(err instanceof ApiError ? err.message : t("briefDetailError"));
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await api.briefs.delete(id);
      setHistory((prev) => prev?.filter((b) => b.id !== id) ?? null);
      if (openBriefId === id) {
        setOpenBriefId(null);
        setOpenBrief(null);
      }
      if (justGenerated?.id === id) setJustGenerated(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("deleteError"));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>

        <p className="mt-3 text-sm text-foreground/60">{t("description")}</p>

        <form onSubmit={handleGenerate} className="mt-8 flex flex-wrap items-end gap-4">
          <Field
            label={t("fromLabel")}
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Field
            label={t("toLabel")}
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Button type="submit" disabled={generating}>
            {generating ? t("generating") : t("generate")}
          </Button>
        </form>
        {generateError && (
          <div role="alert" className="mt-3 rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-body-s font-medium text-foreground">{generateError}</p>
            <p className="mt-1 text-caption text-foreground/60">{t("generateErrorReassurance")}</p>
          </div>
        )}
        {generateNeedsVerification && <EmailVerificationRequired email={user.email} />}

        {justGenerated && (
          <section className="mt-8 rounded border border-primary bg-primary/5 p-5">
            <h2 className="font-display text-heading-m text-foreground">{t("briefReady")}</h2>
            <BriefContent brief={justGenerated} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <a
                href={api.briefs.pdfUrl(justGenerated.id)}
                className="inline-block text-sm font-medium text-foreground underline underline-offset-2"
              >
                {t("downloadPdf")}
              </a>
              <button
                onClick={() => void handleDownloadSummary(justGenerated)}
                disabled={downloadingSummary}
                className="text-sm font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
              >
                {downloadingSummary ? t("downloadingSummary") : t("downloadSummary")}
              </button>
            </div>
            {summaryDownloadError && (
              <p role="alert" className="mt-2 text-sm font-medium text-foreground">
                {summaryDownloadError}
              </p>
            )}
            {summaryNeedsVerification && <EmailVerificationRequired email={user.email} />}
          </section>
        )}

        {trends && trends.briefCount > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-heading-m text-foreground">{t("trendsTitle")}</h2>
            <p className="mt-1 text-sm text-foreground/60">
              {t("trendsAcrossBriefs", { count: trends.briefCount })}
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {trends.categories.map((row) => (
                <li key={row.category} className="text-sm text-foreground/70">
                  {t("trendsCategoryLine", {
                    category: tEnum(`category.${row.category}`),
                    present: row.briefsPresent,
                    total: row.totalBriefs,
                    persistent: row.briefsPersistent,
                  })}
                </li>
              ))}
            </ul>
            {trends.longitudinalPatterns.length > 0 && (
              <div className="mt-4">
                <h3 className="font-display text-body-l text-foreground">
                  {t("longitudinalPatternsTitle")}
                </h3>
                <ul className="mt-2 flex flex-col gap-1">
                  {trends.longitudinalPatterns.map((pattern) => (
                    <li key={pattern.id} className="text-sm text-foreground/70">
                      {t("longitudinalPatternsLine", {
                        category: tEnum(`category.${pattern.category}`),
                        total: pattern.totalBriefs,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-heading-m text-foreground">{t("pastBriefs")}</h2>
          {briefDetailError && (
            <p
              role="alert"
              className="mt-2 text-sm font-medium text-foreground underline decoration-destructive underline-offset-4"
            >
              {briefDetailError}
            </p>
          )}
          {deleteError && (
            <p
              role="alert"
              className="mt-2 text-sm font-medium text-foreground underline decoration-destructive underline-offset-4"
            >
              {deleteError}
            </p>
          )}
          {history === null ? (
            <p className="mt-3 text-sm text-foreground/50">{tCommon("loading")}</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-foreground/50">{t("noBriefsYet")}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {history.map((item) => (
                <li key={item.id} className="rounded border border-border-subtle p-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => void toggleBrief(item.id)}
                      className="text-left text-sm font-medium text-foreground"
                    >
                      {item.fromDate} to {item.toDate}
                      <span className="ml-2 text-xs font-normal text-foreground/50">
                        {t("generatedOn", { date: new Date(item.createdAt).toLocaleDateString() })}
                      </span>
                    </button>
                    <div className="flex items-center gap-3">
                      <a
                        href={api.briefs.pdfUrl(item.id)}
                        className="text-xs font-medium text-primary underline underline-offset-2"
                      >
                        {t("pdf")}
                      </a>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs font-medium text-foreground underline decoration-destructive underline-offset-2"
                      >
                        {deletingId === item.id ? "…" : t("delete")}
                      </button>
                    </div>
                  </div>
                  {openBriefId === item.id &&
                    (openBrief ? (
                      <BriefContent brief={openBrief} />
                    ) : (
                      <p className="mt-3 text-sm text-foreground/50">{tCommon("loading")}</p>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default function BriefPage() {
  const t = useTranslations("Common");
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-foreground/50">{t("loading")}</p>
        </main>
      }
    >
      <BriefPageContent />
    </Suspense>
  );
}

function formatSeverityBreakdown(
  severityBreakdown: Record<string, number>,
  tEnum: (key: string) => string,
  locale: string,
): string {
  // Same {severity: count} shape brief.pdf.ts has always rendered — no
  // new data, this just brings the in-app view to parity with what the
  // PDF already shows. Intl.ListFormat (not a hardcoded ", " join)
  // handles locale-appropriate separators — Japanese conventionally
  // uses "、" rather than a Latin comma-space, so a hardcoded English
  // separator would have been a real, if small, localization
  // regression for ja specifically.
  const parts = Object.entries(severityBreakdown).map(
    ([severity, count]) => `${count} ${tEnum(`severity.${severity}`)}`,
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(parts);
}

// Resolves a cited Stage4Pattern back to the raw evidence object it was
// built from — everything here (frequencyComparison, coOccurrence,
// treatmentImpact) is already on ClinicalBriefDto, sent to the client
// today, just not yet linked back to the pattern that cites it. Returns
// null rather than throwing when nothing matches (an old brief whose
// interpretation predates one of these fields, or a pattern type this
// resolver doesn't yet cover) — a citation with no resolvable evidence
// still has its observation/caveat text to show, it just skips the
// numeric detail underneath.
type ResolvedEvidence =
  | {
      kind: "frequency";
      currentCount: number;
      previousCount: number;
      currentDates: string[];
      previousDates: string[];
    }
  | {
      kind: "coOccurrence";
      days: number;
      categoryA: string;
      categoryB: string;
      dates: string[];
    }
  | {
      kind: "treatmentImpact";
      beforeCount: number;
      beforeDays: number;
      afterCount: number;
      afterDays: number;
      beforeDates: Array<{ date: string; category: string }>;
      afterDates: Array<{ date: string; category: string }>;
    };

function resolveEvidence(pattern: Stage4Pattern, brief: ClinicalBriefDto): ResolvedEvidence | null {
  const ref = pattern.evidenceRef;
  if ("category" in ref) {
    const entry = brief.frequencyComparison?.find((e) => e.category === ref.category);
    return entry
      ? {
          kind: "frequency",
          currentCount: entry.currentCount,
          previousCount: entry.previousCount,
          currentDates: entry.currentDates,
          previousDates: entry.previousDates,
        }
      : null;
  }
  if ("categoryA" in ref) {
    const co = brief.coOccurrence;
    return co && co.categoryA === ref.categoryA && co.categoryB === ref.categoryB
      ? {
          kind: "coOccurrence",
          days: co.days,
          categoryA: co.categoryA,
          categoryB: co.categoryB,
          dates: co.dates ?? [],
        }
      : null;
  }
  const entry = brief.treatmentImpact?.find((e) => e.treatmentId === ref.treatmentId);
  return entry && !entry.insufficientData
    ? {
        kind: "treatmentImpact",
        beforeCount: entry.before.logCount,
        beforeDays: entry.before.days,
        afterCount: entry.after.logCount,
        afterDays: entry.after.days,
        beforeDates: entry.beforeDates,
        afterDates: entry.afterDates,
      }
    : null;
}

// Formats the literal dates behind a resolved evidence entry's count —
// the day-level detail a founder/user can point to and ask "show me
// exactly what caused this line." Short month/day (not a full date, and
// never a timestamp — occurredAt's time-of-day carries no meaning here,
// same reasoning timeline/page.tsx's own formatDateHeading already
// documents) joined with the locale's own list conjunction, matching
// formatSeverityBreakdown's existing Intl.ListFormat convention above.
function formatEvidenceDates(dates: string[], locale: string): string {
  const formatted = dates.map((date) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
      new Date(`${date}T00:00:00`),
    ),
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(formatted);
}

function formatTreatmentEvidenceDates(
  entries: Array<{ date: string; category: string }>,
  locale: string,
  tEnum: ReturnType<typeof useTranslations<"Enums">>,
): string {
  const formatted = entries.map(
    (entry) =>
      `${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
        new Date(`${entry.date}T00:00:00`),
      )} (${tEnum(`category.${entry.category}`)})`,
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(formatted);
}

// Reuses the exact same i18n messages the standalone frequency/co-occurrence/
// treatment-impact sections further down this page already render — this is
// the same numbers, just surfaced next to the citation that's grounded in
// them, not a second copy of the wording.
function formatEvidenceLine(
  resolved: ResolvedEvidence,
  t: ReturnType<typeof useTranslations<"Brief">>,
  tEnum: ReturnType<typeof useTranslations<"Enums">>,
): string {
  switch (resolved.kind) {
    case "frequency":
      return t("frequencyComparisonEntry", {
        currentCount: resolved.currentCount,
        previousCount: resolved.previousCount,
      });
    case "coOccurrence":
      return t("coOccurrenceEntry", {
        categoryA: tEnum(`category.${resolved.categoryA}`),
        categoryB: tEnum(`category.${resolved.categoryB}`),
        days: resolved.days,
      });
    case "treatmentImpact":
      return t("treatmentImpactEntry", {
        beforeCount: resolved.beforeCount,
        beforeDays: resolved.beforeDays,
        afterCount: resolved.afterCount,
        afterDays: resolved.afterDays,
      });
  }
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  const t = useTranslations("Brief");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const [expandedPatternIds, setExpandedPatternIds] = useState<Set<string>>(new Set());

  function toggleEvidence(id: string) {
    setExpandedPatternIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-foreground/80">{brief.aiNarrative}</p>

      {brief.citedPatternIds && brief.citedPatternIds.length > 0 && brief.interpretation && (
        <div>
          <h3 className="font-medium text-foreground">{t("groundedInTitle")}</h3>
          <ul className="mt-1 flex flex-col gap-2 pl-5 text-foreground/70">
            {brief.citedPatternIds.flatMap((id) => {
              const pattern = brief.interpretation!.patterns.find((entry) => entry.id === id);
              // Should always resolve — citedPatternIds is only ever
              // populated from ids validateStage4Patterns already
              // confirmed exist in this same interpretation (see
              // brief.service.ts). Skips rather than throws if it
              // somehow doesn't, so a single unexpected id can't take
              // down the whole page.
              if (!pattern) return [];
              const expanded = expandedPatternIds.has(id);
              const resolved = resolveEvidence(pattern, brief);
              const detailId = `evidence-detail-${brief.id}-${id}`;
              return (
                <li key={id} className="list-disc">
                  {pattern.observation}
                  {pattern.association ? ` ${pattern.association}` : ""}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleEvidence(id)}
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                    >
                      {expanded ? t("hideEvidence") : t("viewEvidence")}
                    </button>
                  </div>
                  {expanded && (
                    <div
                      id={detailId}
                      className="mt-1 rounded border border-border-subtle bg-surface p-3 text-xs text-foreground/70"
                    >
                      {resolved && <p>{formatEvidenceLine(resolved, t, tEnum)}</p>}
                      {resolved?.kind === "frequency" && (
                        <>
                          {resolved.currentDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesCurrentLabel")}:{" "}
                              {formatEvidenceDates(resolved.currentDates, locale)}
                            </p>
                          )}
                          {resolved.previousDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesPreviousLabel")}:{" "}
                              {formatEvidenceDates(resolved.previousDates, locale)}
                            </p>
                          )}
                        </>
                      )}
                      {resolved?.kind === "coOccurrence" && resolved.dates.length > 0 && (
                        <p className="mt-1">
                          {t("evidenceDatesLabel")}: {formatEvidenceDates(resolved.dates, locale)}
                        </p>
                      )}
                      {resolved?.kind === "treatmentImpact" && (
                        <>
                          {resolved.beforeDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesBeforeLabel")}:{" "}
                              {formatTreatmentEvidenceDates(resolved.beforeDates, locale, tEnum)}
                            </p>
                          )}
                          {resolved.afterDates.length > 0 && (
                            <p className="mt-1">
                              {t("evidenceDatesAfterLabel")}:{" "}
                              {formatTreatmentEvidenceDates(resolved.afterDates, locale, tEnum)}
                            </p>
                          )}
                        </>
                      )}
                      {resolved && (
                        <p className="mt-1 text-foreground/50">
                          {t("evidenceDatesInterpretation")}
                        </p>
                      )}
                      <p className="mt-1">{pattern.caveat}</p>
                      <p className="mt-2 text-foreground/50">
                        {t("evidenceSourceLabel")}: {t("evidenceSourceSelfReported")}
                      </p>
                      <p className="text-foreground/50">
                        {t("evidenceConfidenceLabel")}: {t("evidenceConfidenceDescriptive")}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-medium text-foreground">{t("questionsForGp")}</h3>
        <ul className="mt-1 list-disc pl-5 text-foreground/80">
          {brief.aiDiscussionTopics.map((topic, i) => (
            <li key={i}>{topic}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-foreground">{t("symptomFrequency")}</h3>
        <ul className="mt-1 text-foreground/70">
          {brief.symptomSummary.map((entry) => (
            <li key={entry.category}>
              {tEnum(`category.${entry.category}`)}: {t("occurrenceCount", { count: entry.count })}{" "}
              ({formatSeverityBreakdown(entry.severityBreakdown, tEnum, locale)})
            </li>
          ))}
        </ul>
      </div>

      {brief.frequencyComparison && brief.frequencyComparison.length > 0 && (
        <div>
          <h3 className="font-medium text-foreground">{t("frequencyComparisonTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.frequencyComparison.map((entry) => (
              <li key={entry.category}>
                {tEnum(`category.${entry.category}`)}:{" "}
                {t("frequencyComparisonEntry", {
                  currentCount: entry.currentCount,
                  previousCount: entry.previousCount,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.persistentSymptoms && brief.persistentSymptoms.length > 0 && (
        <div>
          <h3 className="font-medium text-foreground">{t("persistentSymptomsTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.persistentSymptoms.map((category) => (
              <li key={category}>
                {t("persistentSymptomsEntry", { category: tEnum(`category.${category}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.coOccurrence && (
        <div>
          <h3 className="font-medium text-foreground">{t("patternsNoticedTitle")}</h3>
          <p className="mt-1 text-foreground/70">
            {t("coOccurrenceEntry", {
              categoryA: tEnum(`category.${brief.coOccurrence.categoryA}`),
              categoryB: tEnum(`category.${brief.coOccurrence.categoryB}`),
              days: brief.coOccurrence.days,
            })}
          </p>
        </div>
      )}

      <div>
        <h3 className="font-medium text-foreground">{t("cycleSummary")}</h3>
        <p className="mt-1 text-foreground/70">
          {brief.cycleSummary.averageCycleLengthDays === null
            ? t("notEnoughCycleData")
            : t("averageCycleLength", {
                days: brief.cycleSummary.averageCycleLengthDays,
                count: brief.cycleSummary.cycleCount,
              })}
        </p>
      </div>

      <div>
        <h3 className="font-medium text-foreground">{t("treatmentsLoggedDuringPeriod")}</h3>
        {brief.treatmentSummary.length === 0 ? (
          <p className="mt-1 text-foreground/70">{t("noTreatmentsInRange")}</p>
        ) : (
          <ul className="mt-1 text-foreground/70">
            {brief.treatmentSummary.map((entry, i) => (
              <li key={i}>
                {entry.name}: {tEnum(`treatmentCategory.${entry.category}`)}, {entry.startDate} –{" "}
                {entry.endDate ?? t("ongoing")}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-foreground/50">{t("treatmentSafetyNote")}</p>
      </div>

      {brief.treatmentImpact && brief.treatmentImpact.length > 0 && (
        <div>
          <h3 className="font-medium text-foreground">{t("treatmentImpactTitle")}</h3>
          <ul className="mt-1 text-foreground/70">
            {brief.treatmentImpact.map((entry) => (
              <li key={entry.treatmentId}>
                {entry.name}:{" "}
                {entry.insufficientData
                  ? t("treatmentImpactInsufficientData")
                  : t("treatmentImpactEntry", {
                      beforeCount: entry.before.logCount,
                      beforeDays: entry.before.days,
                      afterCount: entry.after.logCount,
                      afterDays: entry.after.days,
                    })}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-foreground/50">{t("treatmentSafetyNote")}</p>
        </div>
      )}
    </div>
  );
}
