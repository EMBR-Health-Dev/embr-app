import type { SupportMessageInput } from "@embr/validation";

/** Where a message goes if the form cannot send it: the same inbox. */
export const SUPPORT_ADDRESS = "info@embrhealthcare.com";

export type SupportSendResult = "sent" | "invalid" | "rate-limited" | "failed";

/**
 * The Help page contact form. Plain fetch with no cookies: it works
 * signed out, and the message needs nothing from the session.
 */
export async function sendSupportMessage(input: SupportMessageInput): Promise<SupportSendResult> {
  try {
    const res = await fetch("/api/support/messages", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) return "sent";
    if (res.status === 400) return "invalid";
    if (res.status === 429) return "rate-limited";
    return "failed";
  } catch {
    return "failed";
  }
}
