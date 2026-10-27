"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "../lib/api";
import { toIsoDate } from "../lib/date-format";
import { isMrsDue, mrsAvailable } from "../lib/mrs";

/**
 * A quiet card on the dashboard when the monthly rating is due. Renders
 * nothing while the check-in is switched off, in Japanese, while
 * loading, on an error, or when it is not due.
 */
export function MrsDueCard() {
  const t = useTranslations("MrsCheckIn");
  const locale = useLocale();
  const available = mrsAvailable(locale);
  const [due, setDue] = useState(false);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    api.mrsCheckIns
      .list()
      .then((rows) => {
        if (!cancelled) setDue(isMrsDue(rows, toIsoDate(new Date())));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [available]);

  if (!available || !due) return null;
  return (
    <section
      aria-labelledby="mrs-due"
      className="mt-6 rounded-lg border border-border-subtle bg-surface p-5"
    >
      <h2 id="mrs-due" className="font-display text-heading-m text-foreground">
        {t("dashboardTitle")}
      </h2>
      <p className="mt-1 max-w-prose text-body-s text-foreground/70">{t("dashboardBody")}</p>
      <Link
        href="/monthly-rating"
        className="mt-3 inline-flex min-h-11 items-center text-body-s font-medium text-foreground underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("dashboardCta")}
      </Link>
    </section>
  );
}
