"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "../../lib/auth-context";

function buildExportUrl(path: string, from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  const query = params.toString();
  return `/api/export/${path}${query ? `?${query}` : ""}`;
}

export default function ExportPage() {
  const t = useTranslations("Export");
  const tCommon = useTranslations("Common");
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
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const downloads = [
    {
      label: t("clinicianSummaryLabel"),
      description: t("clinicianSummaryDescription"),
      path: buildExportUrl("summary.pdf", from, to),
    },
    {
      label: t("symptomLogsLabel"),
      description: t("symptomLogsDescription"),
      path: buildExportUrl("symptom-logs.csv", from, to),
    },
    {
      label: t("cycleEntriesLabel"),
      description: t("cycleEntriesDescription"),
      path: buildExportUrl("cycle-entries.csv", from, to),
    },
    {
      label: t("treatmentsLabel"),
      description: t("treatmentsDescription"),
      path: buildExportUrl("treatments.csv", from, to),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-foreground underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      <p className="mt-3 text-sm text-foreground/60">{t("description")}</p>

      <section className="mt-8 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("fromLabel")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("toLabel")}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        {downloads.map((d) => (
          <a
            key={d.path}
            href={d.path}
            className="flex flex-col gap-1 rounded border border-border-subtle p-4 transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="font-medium text-foreground">{d.label}</span>
            <span className="text-sm text-foreground/60">{d.description}</span>
          </a>
        ))}
      </section>
    </main>
  );
}
