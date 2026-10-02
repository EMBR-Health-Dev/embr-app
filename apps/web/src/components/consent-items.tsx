"use client";

import { useTranslations } from "next-intl";
import type { ConsentType } from "@embr/types";

const LABEL_KEY: Record<ConsentType, "termsLabel" | "privacyLabel" | "healthLabel"> = {
  TERMS: "termsLabel",
  PRIVACY: "privacyLabel",
  HEALTH_PROCESSING: "healthLabel",
};

/**
 * One separate, unchecked-by-default checkbox per consent item. Shared
 * by the registration form and the consent screen so the wording and
 * behaviour can never drift between them. Checked state is always
 * owned by the caller and starts false — nothing here pre-ticks a box.
 *
 * The Terms of Use and Privacy Policy are not published yet, so nothing
 * here links to them or asks anyone to agree to them; a note says they
 * will be published before sign-up opens. Linking them again is a
 * separate release, together with their final versions.
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
                {t(LABEL_KEY[type])}
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
      <p className="text-xs text-foreground/60">{t("documentsPending")}</p>
    </fieldset>
  );
}
