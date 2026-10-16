const FEEDBACK_ADDRESS = "info@embrhealthcare.com";

/**
 * A mailto link for "Send feedback". It carries the page and the
 * browser so a report is actionable without a back and forth, and
 * nothing else: no health data and no query string (which can hold
 * dates or ids). The person's own mail app adds who they are.
 */
export function feedbackHref(input: {
  subject: string;
  intro: string;
  pageLabel: string;
  browserLabel: string;
  pathname: string;
  userAgent: string;
}): string {
  const body = `${input.intro}\n\n\n${input.pageLabel}: ${input.pathname}\n${input.browserLabel}: ${input.userAgent}\n`;
  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(body)}`;
}
