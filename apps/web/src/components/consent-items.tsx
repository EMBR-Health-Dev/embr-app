"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ConsentType } from "@embr/types";
import { LEGAL_DOCUMENT_URLS } from "@embr/validation";

const LABEL_KEY: Record<ConsentType, "termsLabel" | "privacyLabel" | "healthLabel"> = {
  TERMS: "termsLabel",
  PRIVACY: "privacyLabel",
  HEALTH_PROCESSING: "healthLabel",
};

const LINK_URL: Record<ConsentType, string> = {
  TERMS: LEGAL_DOCUMENT_URLS.TERMS,
  PRIVACY: LEGAL_DOCUMENT_URLS.PRIVACY,
  HEALTH_PROCESSING: LEGAL_DOCUMENT_URLS.PRIVACY,
};

/**
 * One separate, unchecked-by-default checkbox per consent item. Shared
 * by the registration form and the consent screen so the wording and
 * behaviour can never drift between them. Checked state is always
 * owned by the caller and starts false — nothing here pre-ticks a box.
 */
export function ConsentItems({
  items,
  checked,
  onToggle,
  errors = {},
  notes = {},
}: {
  items: ConsentType[];
  checked: Partial<Record<ConsentType, boolean>>;
  onToggle: (type: ConsentType, value: boolean) => void;
  errors?: Partial<Record<ConsentType, string>>;
  notes?: Partial<Record<ConsentType, string>>;
}) {
  const t = useTranslations("Consent");

  function link(type: ConsentType) {
    function DocumentLink(chunks: ReactNode) {
      return (
        <a
          href={LINK_URL[type]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          {chunks}
          <span className="sr-only"> {t("opensInNewTab")}</span>
        </a>
      );
    }
    return DocumentLink;
  }

  return (
    <fieldset className="flex flex-col gap-4">
      {items.map((type) => {
        const id = `consent-${type}`;
        const error = errors[type];
        const note = notes[type];
        return (
          <div key={type} className="flex flex-col gap-2">
            {type === "HEALTH_PROCESSING" && (
              <p className="text-sm text-foreground/70">{t("healthExplanation")}</p>
            )}
            <div className="flex items-start gap-3">
              <input
                id={id}
                type="checkbox"
                checked={checked[type] === true}
                onChange={(e) => onToggle(type, e.target.checked)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : note ? `${id}-note` : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <label htmlFor={id} className="text-sm text-foreground">
                {t.rich(LABEL_KEY[type], { link: link(type) })}
              </label>
            </div>
            {note && (
              <p id={`${id}-note`} className="pl-7 text-xs text-foreground/60">
                {note}
              </p>
            )}
            {error && (
              <p
                id={`${id}-error`}
                role="alert"
                className="pl-7 text-xs font-medium text-foreground"
              >
                {error}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
