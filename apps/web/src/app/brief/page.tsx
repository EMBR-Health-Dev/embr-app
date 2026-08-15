"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function BriefPage() {
  const t = useTranslations("Brief");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<ClinicalBriefDto | null>(null);

  const [history, setHistory] = useState<ClinicalBriefListItemDto[] | null>(null);
  const [openBriefId, setOpenBriefId] = useState<string | null>(null);
  const [openBrief, setOpenBrief] = useState<ClinicalBriefDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  function loadHistory() {
    api.briefs.list({ pageSize: 20 }).then((page) => setHistory(page.items));
  }

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerateError(null);

    if (!fromDate || !toDate) {
      setGenerateError(t("pickDates"));
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({ fromDate, toDate });
      setJustGenerated(brief);
      loadHistory();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : t("generateError"));
    } finally {
      setGenerating(false);
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
    const brief = await api.briefs.get(id);
    setOpenBrief(brief);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.briefs.delete(id);
      setHistory((prev) => prev?.filter((b) => b.id !== id) ?? null);
      if (openBriefId === id) {
        setOpenBriefId(null);
        setOpenBrief(null);
      }
      if (justGenerated?.id === id) setJustGenerated(null);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      <p className="mt-3 text-sm text-navy/60">{t("description")}</p>

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
      {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}

      {justGenerated && (
        <section className="mt-8 rounded border border-brass/40 bg-brass/5 p-5">
          <h2 className="font-display text-lg text-navy">{t("briefReady")}</h2>
          <BriefContent brief={justGenerated} />
          <a
            href={api.briefs.pdfUrl(justGenerated.id)}
            className="mt-4 inline-block text-sm font-medium text-teal underline underline-offset-2"
          >
            {t("downloadPdf")}
          </a>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">{t("pastBriefs")}</h2>
        {history === null ? (
          <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">{t("noBriefsYet")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {history.map((item) => (
              <li key={item.id} className="rounded border border-navy/10 p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => void toggleBrief(item.id)}
                    className="text-left text-sm font-medium text-navy"
                  >
                    {item.fromDate} to {item.toDate}
                    <span className="ml-2 text-xs font-normal text-navy/50">
                      {t("generatedOn", { date: new Date(item.createdAt).toLocaleDateString() })}
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <a
                      href={api.briefs.pdfUrl(item.id)}
                      className="text-xs font-medium text-teal underline underline-offset-2"
                    >
                      {t("pdf")}
                    </a>
                    <button
                      onClick={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-xs font-medium text-red-600"
                    >
                      {deletingId === item.id ? "…" : t("delete")}
                    </button>
                  </div>
                </div>
                {openBriefId === item.id &&
                  (openBrief ? (
                    <BriefContent brief={openBrief} />
                  ) : (
                    <p className="mt-3 text-sm text-navy/50">{tCommon("loading")}</p>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  const t = useTranslations("Brief");
  const tEnum = useTranslations("Enums");

  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-navy/80">{brief.aiNarrative}</p>

      <div>
        <h3 className="font-medium text-navy">{t("questionsForGp")}</h3>
        <ul className="mt-1 list-disc pl-5 text-navy/80">
          {brief.aiDiscussionTopics.map((topic, i) => (
            <li key={i}>{topic}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-navy">{t("symptomFrequency")}</h3>
        <ul className="mt-1 text-navy/70">
          {brief.symptomSummary.map((entry) => (
            <li key={entry.category}>
              {tEnum(`category.${entry.category}`)} — {t("occurrenceCount", { count: entry.count })}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-navy">{t("cycleSummary")}</h3>
        <p className="mt-1 text-navy/70">
          {brief.cycleSummary.averageCycleLengthDays === null
            ? t("notEnoughCycleData")
            : t("averageCycleLength", {
                days: brief.cycleSummary.averageCycleLengthDays,
                count: brief.cycleSummary.cycleCount,
              })}
        </p>
      </div>
    </div>
  );
}
