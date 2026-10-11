"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { THEMES, type Theme } from "../display/theme";
import { setTheme } from "../display/actions";
import { useTheme } from "../display/theme-context";

export function ThemeControl() {
  const current = useTheme();
  const t = useTranslations("Settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Theme) {
    if (next === current) return;
    startTransition(async () => {
      await setTheme(next);
      router.refresh();
    });
  }

  return (
    <div role="radiogroup" aria-label={t("themeLabel")} className="mt-4 flex flex-wrap gap-2">
      {THEMES.map((theme) => {
        const selected = theme === current;
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => choose(theme)}
            className={`min-h-11 rounded-sm border px-4 py-2 transition-colors disabled:opacity-60 ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-foreground/40"
            }`}
          >
            {t(`theme.${theme}`)}
          </button>
        );
      })}
    </div>
  );
}
