"use client";

import { useTranslations } from "next-intl";
import { HOT_FLASH_REFERENCE_SECTIONS } from "../content/hot-flash-reference-library";

/**
 * General scientific/clinical background on hot flashes — a nested,
 * collapsed-by-default disclosure inside WhyAmISeeingThis, never a
 * standalone article. This is deliberate: the user's own evidence
 * (the reasoning sentence WhyAmISeeingThis already renders) always
 * comes first; this is an optional, secondary layer someone opens on
 * purpose, not something competing with their own record for
 * attention. See hot-flash-reference-library.ts for the versioned,
 * sourced content this renders — every string here comes from that
 * module or its section body copy in messages/{en,ja}.json; nothing
 * is generated or personalized to the viewer.
 */
export function HotFlashReferenceLibrary() {
  const t = useTranslations("HotFlashReferenceLibrary");

  return (
    <details className="group mt-3 border-t border-border-subtle pt-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-caption font-medium text-foreground/60 marker:content-none hover:text-foreground/80">
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className="h-2 w-2 shrink-0 fill-current transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M1 0l6 4-6 4V0z" />
        </svg>
        {t("toggle")}
      </summary>
      <div className="mt-2 flex flex-col gap-4 pl-3.5">
        <p className="text-caption text-foreground/50">{t("intro")}</p>

        {HOT_FLASH_REFERENCE_SECTIONS.map((section) => (
          <div key={section.id}>
            <h4 className="text-caption font-medium text-foreground/80">
              {t(`sections.${section.id}.heading`)}
            </h4>
            <p className="mt-1 text-caption text-foreground/60">
              {t(`sections.${section.id}.body`)}
            </p>
            {section.isTreatmentPathways && (
              <p className="mt-1 text-caption italic text-foreground/50">
                {t(`sections.${section.id}.caveat`)}
              </p>
            )}
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {section.sources.map((source) => (
                <li key={source.url} className="text-[11px] text-foreground/40">
                  {t("sourceLabel")}: {source.publisher}, {source.title} ({source.sourceVersion}) —{" "}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {source.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="text-caption text-foreground/50">{t("caveat")}</p>
      </div>
    </details>
  );
}
