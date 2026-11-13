"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_SUPPORT_MESSAGE_LENGTH, SUPPORT_TOPICS } from "@embr/validation";
import { Button } from "./button";
import { SUPPORT_ADDRESS, sendSupportMessage, type SupportSendResult } from "../lib/support";

type Topic = (typeof SUPPORT_TOPICS)[number];

/**
 * Write to us from the Help page. It asks for no health details and
 * says so before the message box, and it is honest about what happened:
 * "sent" only when the server says it was, otherwise the plain address.
 */
export function ContactForm({
  defaultEmail,
  fromPage,
}: {
  defaultEmail?: string;
  fromPage?: string;
}) {
  const t = useTranslations("Help");
  const [topic, setTopic] = useState<Topic>("PROBLEM");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SupportSendResult | null>(null);
  const [sentTo, setSentTo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    const outcome = await sendSupportMessage({
      topic,
      message,
      replyEmail: email,
      page: fromPage,
      platform: "web",
      company: company || undefined,
    });
    setSending(false);
    setResult(outcome);
    if (outcome === "sent") {
      setSentTo(email);
      setMessage("");
    }
  }

  if (result === "sent") {
    return (
      <div role="status" className="mt-6 rounded-lg border border-border-subtle bg-surface p-5">
        <p className="text-body-s text-foreground">{t("sent", { email: sentTo })}</p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2 sm:min-h-0"
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-sm border border-border bg-background px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-5" noValidate={false}>
      <p className="rounded-sm border-l-2 border-lilac-500 bg-lilac-100/50 px-3 py-2 text-sm text-foreground">
        {t("noHealthDetails")}
      </p>

      <label className="text-sm font-medium text-foreground">
        {t("topicLabel")}
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as Topic)}
          className={`${fieldClass} min-h-11`}
        >
          {SUPPORT_TOPICS.map((key) => (
            <option key={key} value={key}>
              {t(`topics.${key}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-medium text-foreground">
        {t("messageLabel")}
        <textarea
          required
          minLength={10}
          maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="text-sm font-medium text-foreground">
        {t("emailLabel")}
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${fieldClass} min-h-11`}
        />
      </label>

      {/* Left empty by people, filled by bots: see supportMessageSchema. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Company
          <input
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      {result && (
        <p role="alert" className="text-sm font-medium text-foreground">
          {result === "invalid"
            ? t("invalid")
            : result === "rate-limited"
              ? t("tooMany", { address: SUPPORT_ADDRESS })
              : t("failed", { address: SUPPORT_ADDRESS })}
        </p>
      )}

      <div>
        <Button type="submit" disabled={sending} className="min-h-11">
          {sending ? t("sending") : t("send")}
        </Button>
      </div>
      <p className="text-caption text-foreground/50">{t("notForEmergencies")}</p>
    </form>
  );
}
