"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/button";
import { Field } from "../../components/field";

export default function BriefPage() {
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
      setGenerateError("Pick both a start and end date.");
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({ fromDate, toDate });
      setJustGenerated(brief);
      loadHistory();
    } catch (err) {
      setGenerateError(
        err instanceof ApiError ? err.message : "Couldn't generate a brief — try again.",
      );
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
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">EMBR BRIEF</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      <p className="mt-3 text-sm text-navy/60">
        A summary of your tracked symptoms and cycle data, with questions you can bring to your GP.
        This is a data summary to help your conversation — not a diagnosis, and not medical advice.
      </p>

      <form onSubmit={handleGenerate} className="mt-8 flex flex-wrap items-end gap-4">
        <Field
          label="From"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <Field label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button type="submit" disabled={generating}>
          {generating ? "Generating…" : "Generate brief"}
        </Button>
      </form>
      {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}

      {justGenerated && (
        <section className="mt-8 rounded border border-brass/40 bg-brass/5 p-5">
          <h2 className="font-display text-lg text-navy">Your brief is ready</h2>
          <BriefContent brief={justGenerated} />
          <a
            href={api.briefs.pdfUrl(justGenerated.id)}
            className="mt-4 inline-block text-sm font-medium text-teal underline underline-offset-2"
          >
            Download PDF
          </a>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg text-navy">Past briefs</h2>
        {history === null ? (
          <p className="mt-3 text-sm text-navy/50">Loading…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-navy/50">No briefs generated yet.</p>
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
                      generated {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <a
                      href={api.briefs.pdfUrl(item.id)}
                      className="text-xs font-medium text-teal underline underline-offset-2"
                    >
                      PDF
                    </a>
                    <button
                      onClick={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-xs font-medium text-red-600"
                    >
                      {deletingId === item.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
                {openBriefId === item.id &&
                  (openBrief ? (
                    <BriefContent brief={openBrief} />
                  ) : (
                    <p className="mt-3 text-sm text-navy/50">Loading…</p>
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
  return (
    <div className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-navy/80">{brief.aiNarrative}</p>

      <div>
        <h3 className="font-medium text-navy">Questions to bring to your GP</h3>
        <ul className="mt-1 list-disc pl-5 text-navy/80">
          {brief.aiDiscussionTopics.map((topic, i) => (
            <li key={i}>{topic}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-navy">Symptom frequency</h3>
        <ul className="mt-1 text-navy/70">
          {brief.symptomSummary.map((entry) => (
            <li key={entry.category}>
              {entry.category.replace(/_/g, " ").toLowerCase()} — {entry.count} occurrence
              {entry.count === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-navy">Cycle summary</h3>
        <p className="mt-1 text-navy/70">
          {brief.cycleSummary.averageCycleLengthDays === null
            ? "Not enough period-start entries in this range to compute cycle length."
            : `Average cycle length: ${brief.cycleSummary.averageCycleLengthDays} days (${brief.cycleSummary.cycleCount} cycles recorded)`}
        </p>
      </div>
    </div>
  );
}
