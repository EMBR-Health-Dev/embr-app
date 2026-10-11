import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { ThemeProvider } from "../display/theme-context";
import type { Theme } from "../display/theme";
import { ThemeControl } from "./theme-control";

const setTheme = vi.fn().mockResolvedValue(undefined);
vi.mock("../display/actions", () => ({ setTheme: (theme: string) => setTheme(theme) }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function renderControl(current: Theme, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <ThemeProvider value={current}>
        <ThemeControl />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  setTheme.mockClear();
  refresh.mockClear();
});

describe("ThemeControl", () => {
  it("offers System, Light and Dark and marks the current one", () => {
    renderControl("dark");
    expect(screen.getByRole("radiogroup", { name: "Color theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves a new theme and refreshes so the layout applies it", async () => {
    renderControl("light");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("does nothing when the current theme is chosen again", async () => {
    renderControl("light");
    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("is translated into Japanese", () => {
    renderControl("light", "ja");
    expect(screen.getByRole("radiogroup", { name: "カラーテーマ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ダーク" })).toBeInTheDocument();
  });
});
