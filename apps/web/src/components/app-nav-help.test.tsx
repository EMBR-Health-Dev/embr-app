import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { AppNav } from "./app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/timeline/HOT_FLASH" }));

describe("Help in the menu", () => {
  it("opens the Help page naming the page she came from, and nothing else", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppNav userEmail="p@embr.health" managesOrg={false} onLogout={() => {}} />
      </NextIntlClientProvider>,
    );
    const menu = screen.getByTestId("app-nav-mobile");
    const href = within(menu).getByRole("link", { name: "Help" }).getAttribute("href")!;
    expect(href).toBe("/help?from=%2Ftimeline%2FHOT_FLASH");
    expect(href).not.toContain("embr.health");
  });
});
