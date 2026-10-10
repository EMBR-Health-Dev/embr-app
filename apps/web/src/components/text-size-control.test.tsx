import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { TextSizeProvider } from "../display/text-size-context";
import type { TextSize } from "../display/text-size";
import { TextSizeControl } from "./text-size-control";

const setTextSize = vi.fn().mockResolvedValue(undefined);
vi.mock("../display/actions", () => ({ setTextSize: (size: string) => setTextSize(size) }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function renderControl(current: TextSize, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <TextSizeProvider value={current}>
        <TextSizeControl />
      </TextSizeProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  setTextSize.mockClear();
  refresh.mockClear();
});

describe("TextSizeControl", () => {
  it("offers the three sizes and marks the current one", () => {
    renderControl("large");
    const group = screen.getByRole("radiogroup", { name: "Text size" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Standard" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Large" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Larger" })).toHaveAttribute("aria-checked", "false");
  });

  it("saves a new size and refreshes so the layout applies it", async () => {
    renderControl("standard");
    await userEvent.click(screen.getByRole("radio", { name: "Larger" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setTextSize).toHaveBeenCalledWith("larger");
  });

  it("does nothing when the current size is chosen again", async () => {
    renderControl("standard");
    await userEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(setTextSize).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is translated into Japanese", () => {
    renderControl("standard", "ja");
    expect(screen.getByRole("radiogroup", { name: "文字の大きさ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "特大" })).toBeInTheDocument();
  });
});
