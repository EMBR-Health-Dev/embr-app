"use client";

import { useTranslations } from "next-intl";
import type { EvidenceStrength } from "@embr/types";

/**
 * A small, factual label for how much of a person's record exists to
 * draw on — not a clinical judgment, not a score. The strength value
 * itself comes from a deterministic backend bucket (see
 * apps/api/src/modules/trends/evidence-strength.ts); this component
 * only renders it. Reusable across Signals and, eventually, the
 * Clinical Brief — no page-specific logic lives here.
 */
export function EvidenceStrengthBadge({ strength }: { strength: EvidenceStrength }) {
  const t = useTranslations("EvidenceStrength");

  return (
    <div
      className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1"
      role="status"
      aria-label={t("groupLabel")}
    >
      <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-caption font-medium uppercase tracking-[0.08em] text-foreground/70">
        {t(`label.${strength}`)}
      </span>
      <p className="text-caption text-foreground/50">{t(`caption.${strength}`)}</p>
    </div>
  );
}
