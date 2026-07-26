"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";

function buildExportUrl(path: string, from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  const query = params.toString();
  return `/api/export/${path}${query ? `?${query}` : ""}`;
}

export default function ExportPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  const downloads = [
    {
      label: "Clinician summary (PDF)",
      description:
        "A short summary formatted for a doctor's visit — symptom frequency, cycle length, and the log itself.",
      path: buildExportUrl("summary.pdf", from, to),
    },
    {
      label: "Symptom logs (CSV)",
      description:
        "Every symptom entry in the range, one row each — for your own records or another tool.",
      path: buildExportUrl("symptom-logs.csv", from, to),
    },
    {
      label: "Cycle entries (CSV)",
      description: "Every cycle entry in the range, one row each.",
      path: buildExportUrl("cycle-entries.csv", from, to),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">Export your data</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      <p className="mt-3 text-sm text-navy/60">
        Everything you export stays on your device — nothing is sent anywhere else. Leave the dates
        blank to export everything.
      </p>

      <section className="mt-8 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-navy">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-sm border border-navy/20 bg-bone px-3 py-2 text-navy"
          />
        </label>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        {downloads.map((d) => (
          <a
            key={d.path}
            href={d.path}
            className="flex flex-col gap-1 rounded border border-navy/10 p-4 transition-colors hover:border-brass hover:bg-brass/5"
          >
            <span className="font-medium text-navy">{d.label}</span>
            <span className="text-sm text-navy/60">{d.description}</span>
          </a>
        ))}
      </section>
    </main>
  );
}
