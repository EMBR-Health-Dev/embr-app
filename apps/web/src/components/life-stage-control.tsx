"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";

// null is "Prefer not to say": choosing it clears the stored answer.
const OPTIONS = [
  { value: "PERIMENOPAUSE", key: "perimenopause" },
  { value: "POSTMENOPAUSE", key: "postmenopause" },
  { value: "NOT_SURE", key: "notSure" },
  { value: null, key: "preferNotToSay" },
] as const;

export function LifeStageControl() {
  const t = useTranslations("Settings");
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    api.onboarding
      .get()
      .then((profile) => setCurrent(profile.lifeStage))
      .catch(() => setCurrent(null));
  }, []);

  async function choose(next: string | null) {
    if (next === current || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const profile = await api.onboarding.patch({ lifeStage: next });
      setCurrent(profile.lifeStage);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (current === undefined) return null;

  return (
    <>
      <div
        role="radiogroup"
        aria-label={t("lifeStageTitle")}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        {OPTIONS.map(({ value, key }) => {
          const selected = value === current;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => void choose(value)}
              className={`min-h-11 rounded-sm border px-4 py-2 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-foreground/40"
              }`}
            >
              {t(`lifeStage.${key}`)}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-foreground/70">
        {status === "saved" && t("lifeStageSaved")}
        {status === "error" && t("lifeStageError")}
      </p>
    </>
  );
}
