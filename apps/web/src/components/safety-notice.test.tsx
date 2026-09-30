import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { SafetyNotice } from "./safety-notice";

function renderWithIntl(locale: "en" | "ja") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <SafetyNotice />
    </NextIntlClientProvider>,
  );
}

describe("SafetyNotice", () => {
  it("shows the heading and emergency numbers in English", () => {
    renderWithIntl("en");
    expect(screen.getByRole("heading", { name: /urgent help/i })).toBeTruthy();
    expect(screen.getByText(/112/)).toBeTruthy();
    expect(screen.getByText(/999/)).toBeTruthy();
    expect(screen.getByText(/119/)).toBeTruthy();
  });

  it("shows the notice in Japanese with the same emergency numbers", () => {
    renderWithIntl("ja");
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(screen.getByText(/119/)).toBeTruthy();
    expect(screen.getByText(/112/)).toBeTruthy();
  });

  it("carries the self-harm guidance in both languages", () => {
    const en = renderWithIntl("en");
    expect(en.container.textContent).toContain(messages.SafetyNotice.selfHarm);
    en.unmount();
    const jp = renderWithIntl("ja");
    expect(jp.container.textContent).toContain(ja.SafetyNotice.selfHarm);
  });
});
