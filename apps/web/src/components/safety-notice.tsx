"use client";

import { useTranslations } from "next-intl";

/**
 * A short, always-visible pointer to emergency help. EMBR is a
 * record-keeping tool: it cannot recognise an emergency, so the app
 * says so plainly and names the local emergency numbers instead of
 * leaving that to the reader to infer.
 *
 * Deliberately not collapsed and not personalised. It never varies by
 * what the person has logged, so it cannot be read as a judgement about
 * their data. Wording is a first draft and needs clinical and legal
 * review before launch; keep it in messages/{en,ja}.json, not here.
 */
export function SafetyNotice() {
  const t = useTranslations("SafetyNotice");

  return (
    <aside
      aria-labelledby="safety-notice-heading"
      className="mt-10 rounded-md border border-border-subtle p-4"
    >
      <h2 id="safety-notice-heading" className="text-caption font-medium text-foreground/80">
        {t("heading")}
      </h2>
      <p className="mt-1.5 text-caption text-foreground/60">{t("body")}</p>
      <p className="mt-1.5 text-caption text-foreground/60">{t("selfHarm")}</p>
    </aside>
  );
}
