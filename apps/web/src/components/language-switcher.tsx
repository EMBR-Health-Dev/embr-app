"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, type Locale } from "../i18n/locale";
import { setLocale } from "../i18n/actions";

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs text-navy/50">
      <span className="sr-only">{t("label")}</span>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => handleChange(l)}
          disabled={pending}
          aria-current={l === locale}
          className={
            l === locale
              ? "font-medium text-navy underline underline-offset-2"
              : "text-navy/50 hover:text-navy disabled:opacity-50"
          }
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
