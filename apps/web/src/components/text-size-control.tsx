"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TEXT_SIZES, type TextSize } from "../display/text-size";
import { setTextSize } from "../display/actions";
import { useTextSize } from "../display/text-size-context";

// Each option previews its own size, relative to the current root, so
// the difference is visible before choosing.
const PREVIEW_SCALE: Record<TextSize, string> = {
  standard: "1rem",
  large: "1.125rem",
  larger: "1.25rem",
};

export function TextSizeControl() {
  const current = useTextSize();
  const t = useTranslations("Settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: TextSize) {
    if (next === current) return;
    startTransition(async () => {
      await setTextSize(next);
      router.refresh();
    });
  }

  return (
    <div role="radiogroup" aria-label={t("textSizeLabel")} className="mt-4 flex flex-wrap gap-2">
      {TEXT_SIZES.map((size) => {
        const selected = size === current;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => choose(size)}
            style={{ fontSize: PREVIEW_SCALE[size] }}
            className={`min-h-11 rounded-sm border px-4 py-2 transition-colors disabled:opacity-60 ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-foreground/40"
            }`}
          >
            {t(`textSize.${size}`)}
          </button>
        );
      })}
    </div>
  );
}
