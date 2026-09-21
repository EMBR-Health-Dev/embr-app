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
    <details className="mt-3 border-t border-border-subtle pt-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60 underline underline-offset-2 marker:content-none">
        {t("toggle")}
      </summary>
      <div className="mt-2 flex flex-col gap-4">
        <p className="text-xs text-foreground/50">{t("intro")}</p>

        {HOT_FLASH_REFERENCE_SECTIONS.map((section) => (
          <div key={section.id}>
            <h4 className="text-xs font-medium text-foreground/80">
              {t(`sections.${section.id}.heading`)}
            </h4>
            <p className="mt-1 text-xs text-foreground/60">{t(`sections.${section.id}.body`)}</p>
            {section.isTreatmentPathways && (
              <p className="mt-1 text-xs italic text-foreground/50">
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

        <p className="text-xs text-foreground/50">{t("caveat")}</p>
      </div>
    </details>
  );
}
