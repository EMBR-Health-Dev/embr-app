import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { AppNav } from "./app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/timeline/HOT_FLASH" }));

describe("Send feedback", () => {
  it("opens an email naming the page and browser, and nothing else", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppNav userEmail="p@embr.health" managesOrg={false} onLogout={() => {}} />
      </NextIntlClientProvider>,
    );
    const menu = screen.getByTestId("app-nav-mobile");
    const href = within(menu).getByRole("link", { name: "Send feedback" }).getAttribute("href")!;
    expect(href.startsWith("mailto:info@embrhealthcare.com?")).toBe(true);
    const body = decodeURIComponent(new URL(href).searchParams.get("body") ?? "");
    expect(body).toContain("Page: /timeline/HOT_FLASH");
    expect(body).toContain("Browser: ");
    expect(body).not.toContain("p@embr.health");
  });
});
