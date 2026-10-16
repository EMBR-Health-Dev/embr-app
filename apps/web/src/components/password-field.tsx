"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";

/**
 * A password input with a show/hide toggle. Same look and error
 * handling as Field; the toggle sits beside the input (not inside the
 * label) so clicking it never moves focus into the field by accident.
 * People mistype passwords they cannot see, most of all on a phone,
 * and a mistyped password at sign up means a locked out first login.
 */
export function PasswordField({
  label,
  error,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; error?: string }) {
  const t = useTranslations("PasswordField");
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={inputId} className="font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`min-w-0 flex-1 rounded-sm border bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
            error ? "border-foreground" : "border-border"
          }`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={inputId}
          className="shrink-0 rounded-sm border border-border px-3 text-xs font-medium text-graphite-700 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {visible ? t("hide") : t("show")}
        </button>
      </div>
      {error && (
        <span
          id={errorId}
          role="alert"
          className="border-l-2 border-destructive pl-2 text-xs font-medium text-foreground"
        >
          {error}
        </span>
      )}
    </div>
  );
}
