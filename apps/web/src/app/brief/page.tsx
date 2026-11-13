"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { BriefTrendsDto, ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { MAX_BRIEF_PRIORITY_LENGTH } from "@embr/validation";
import { AppointmentFeedback } from "../../components/appointment-feedback";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { AppNav } from "../../components/app-nav";
import { EmailVerificationRequired } from "../../components/email-verification-required";
import { endOfLocalDay, startOfLocalDay, toIsoDate } from "../../lib/date-format";
import { daysAgoIsoDate, fetchRecordSpan } from "../../lib/record-history";
import { BriefContent } from "../../components/brief-content";
import { BriefShare } from "../../components/brief-share";
import { richText } from "../../lib/rich-text";
import { formatHistoryDate } from "../../lib/symptom-history-format";

function BriefPageContent() {
  const t = useTranslations("Brief");
  const locale = useLocale();
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
  const [fromDate, setFromDate] = useState(() => searchParams.get("from") ?? daysAgoIsoDate(30));
  const [toDate, setToDate] = useState(() => searchParams.get("to") ?? toIsoDate(new Date()));
  // What she most wants her clinician to understand: printed first in
  // the BRIEF, never sent to the AI. Blank lines are dropped by the API.
  const [priorities, setPriorities] = useState<string[]>(["", "", ""]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Kept apart from generateError: a missing date is a form-validation
  // prompt, not a failed generation, so it must not carry the
  // "nothing was lost, try again" reassurance that error box shows.
  const [dateError, setDateError] = useState<string | null>(null);
  // First day of the person's record, for the "Since your first entry"
  // preset: a brief can cover the whole history, not only recent weeks.
  const [recordStart, setRecordStart] = useState<string | null>(null);
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

  useEffect(() => {
    if (!user) return;
    fetchRecordSpan()
      .then((span) => setRecordStart(span.start))
      .catch(() => setRecordStart(null));
  }, [user]);

  function applyPreset(from: string) {
    setFromDate(from);
    setToDate(toIsoDate(new Date()));
    setDateError(null);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerateError(null);
    setDateError(null);
    setGenerateNeedsVerification(false);

    if (!fromDate || !toDate) {
      setDateError(t("pickDates"));
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({
        fromDate: startOfLocalDay(fromDate),
        toDate: endOfLocalDay(toDate),
        priorities: priorities.map((p) => p.trim()).filter((p) => p.length > 0),
      });
      setJustGenerated(brief);
      setPriorities(["", "", ""]);
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
      // Local-day boundaries, the same as generation and the /export
      // page: the bare "YYYY-MM-DD" strings parse as UTC midnight, and
      // `to` at midnight dropped every entry logged on the last day.
      const blob = await api.export.clinicianSummaryPdf({
        from: startOfLocalDay(brief.fromDate),
        to: endOfLocalDay(brief.toDate),
      });
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

        <p className="mt-3 text-sm text-foreground/60">{t.rich("description", richText)}</p>
        <p className="mt-1 text-xs text-foreground/45">{t.rich("noMinimumEntries", richText)}</p>

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
          <div
            role="group"
            aria-label={t("presetsLabel")}
            className="flex basis-full flex-wrap items-center gap-2"
          >
            {[
              { label: t("preset30"), from: daysAgoIsoDate(30) },
              { label: t("preset90"), from: daysAgoIsoDate(90) },
              ...(recordStart ? [{ label: t("presetAll"), from: recordStart }] : []),
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.from)}
                className="rounded-sm border border-border bg-background min-h-11 px-3 py-1 text-xs sm:min-h-0 font-medium text-foreground transition-colors hover:border-lilac-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <fieldset className="basis-full">
            <legend className="text-sm font-medium text-foreground">{t("prioritiesLegend")}</legend>
            <p className="mt-1 text-xs text-foreground/60">{t("prioritiesHint")}</p>
            <div className="mt-3 flex flex-col gap-3">
              {priorities.map((value, i) => (
                <Field
                  key={i}
                  label={t("priorityLabel", { number: i + 1 })}
                  type="text"
                  maxLength={MAX_BRIEF_PRIORITY_LENGTH}
                  value={value}
                  onChange={(e) =>
                    setPriorities((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                  }
                />
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={generating}>
            {generating ? t("generating") : t("generate")}
          </Button>
        </form>
        {dateError && (
          <p role="alert" className="mt-3 text-sm font-medium text-foreground">
            {dateError}
          </p>
        )}
        {generateError && (
          <div role="alert" className="mt-3 rounded-lg border border-border-subtle bg-surface p-4">
            <p className="text-body-s font-medium text-foreground">{generateError}</p>
            <p className="mt-1 text-caption text-foreground/60">{t("generateErrorReassurance")}</p>
          </div>
        )}
        {generateNeedsVerification && <EmailVerificationRequired email={user.email} />}

        {justGenerated && (
          <section className="mt-10 border-t-2 border-lilac-600 pt-6">
            <div className="rounded-sm bg-lilac-100 px-4 py-3">
              <h2 className="font-display text-heading-m text-foreground">{t("briefReady")}</h2>
              <p className="mt-1 text-sm font-medium text-lilac-700">
                {t("periodRange", {
                  from: formatHistoryDate(locale, justGenerated.fromDate.slice(0, 10)),
                  to: formatHistoryDate(locale, justGenerated.toDate.slice(0, 10)),
                })}
              </p>
            </div>
            <BriefContent brief={justGenerated} />
            <BriefShare briefId={justGenerated.id} />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={api.briefs.pdfUrl(justGenerated.id)}
                className="inline-flex items-center justify-center rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-graphite-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("downloadPdf")}
              </a>
              <button
                onClick={() => void handleDownloadSummary(justGenerated)}
                disabled={downloadingSummary}
                className="inline-flex items-center justify-center rounded-sm border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-lilac-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
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

        {trends && trends.briefCount > 0 && trends.categories.length > 0 && (
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
            <ul className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
              {history.map((item) => (
                <li key={item.id} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => void toggleBrief(item.id)}
                      className="text-left text-sm font-medium text-foreground"
                    >
                      {t("periodRange", {
                        from: formatHistoryDate(locale, item.fromDate.slice(0, 10)),
                        to: formatHistoryDate(locale, item.toDate.slice(0, 10)),
                      })}
                      <span className="ml-2 text-xs font-normal text-foreground/50">
                        {t("generatedOn", {
                          date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                            new Date(item.createdAt),
                          ),
                        })}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={api.briefs.pdfUrl(item.id)}
                        className="text-xs font-medium text-lilac-700 underline underline-offset-2 inline-flex min-h-11 items-center sm:min-h-0"
                      >
                        {t("pdf")}
                      </a>
                      <button
                        onClick={() => void handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs font-medium text-foreground underline decoration-destructive underline-offset-2 inline-flex min-h-11 items-center sm:min-h-0"
                      >
                        {deletingId === item.id ? "…" : t("delete")}
                      </button>
                    </div>
                  </div>
                  {openBriefId === item.id &&
                    (openBrief ? (
                      <>
                        <BriefContent brief={openBrief} />
                        <BriefShare briefId={openBrief.id} />
                        <AppointmentFeedback briefId={openBrief.id} />
                      </>
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

// Section labels inside a brief: plain sentence case headings over a
// hairline rule, so the page reads like a printed report rather than
// a stack of cards.

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
