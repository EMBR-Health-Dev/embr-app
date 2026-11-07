"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppointmentOutcome } from "@embr/types";
import { api } from "../lib/api";
import { Button } from "./button";

const OUTCOMES: AppointmentOutcome[] = [
  "YES_SIGNIFICANTLY",
  "YES_SOMEWHAT",
  "NOT_REALLY",
  "NO",
  "NO_APPOINTMENT_YET",
];

const COMMENT_MAX = 500;

/**
 * The appointment follow up on a past BRIEF: one question, five
 * answers and an optional short comment. Her answer can be changed at
 * any time. The comment is stored encrypted and only counted answers
 * reach the admin dashboard; it is never sent to the AI.
 */
export function AppointmentFeedback({ briefId }: { briefId: string }) {
  const t = useTranslations("AppointmentFeedback");
  const id = useId();
  const [answer, setAnswer] = useState<AppointmentOutcome | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error" | "missing">("idle");

  useEffect(() => {
    let cancelled = false;
    api.briefs
      .feedback(briefId)
      .then((saved) => {
        if (cancelled || !saved) return;
        setAnswer(saved.answer);
        setComment(saved.comment ?? "");
      })
      .catch(() => {
        // Not having her earlier answer only means the form starts empty.
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!answer) {
      setStatus("missing");
      return;
    }
    setStatus("saving");
    try {
      await api.briefs.saveFeedback(briefId, {
        answer,
        comment: comment.trim() ? comment.trim() : null,
      });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={save}
      aria-labelledby={`${id}-title`}
      className="mt-6 rounded-sm border border-border-subtle p-4"
    >
      <h3 id={`${id}-title`} className="font-semibold text-foreground">
        {t("title")}
      </h3>
      <fieldset className="mt-2">
        <legend className="text-sm text-foreground/85">{t("question")}</legend>
        <div className="mt-2 flex flex-col gap-1.5">
          {OUTCOMES.map((outcome) => (
            <label key={outcome} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-answer`}
                value={outcome}
                checked={answer === outcome}
                onChange={() => {
                  setAnswer(outcome);
                  setStatus("idle");
                }}
              />
              {t(outcome)}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${id}-comment`} className="mt-3 block text-sm text-foreground/85">
        {t("commentLabel")}
      </label>
      <textarea
        id={`${id}-comment`}
        value={comment}
        maxLength={COMMENT_MAX}
        rows={3}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setComment(e.target.value);
          setStatus("idle");
        }}
        className="mt-1 w-full rounded-sm border border-border p-2 text-sm"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-foreground/60">
        {t("commentHint")}
      </p>
      <Button type="submit" disabled={status === "saving"} className="mt-3 min-h-11">
        {status === "saving" ? t("saving") : t("save")}
      </Button>
      <p role="status" className="mt-2 text-sm text-foreground/80">
        {status === "saved" && t("saved")}
        {status === "error" && t("error")}
        {status === "missing" && t("chooseFirst")}
      </p>
    </form>
  );
}
