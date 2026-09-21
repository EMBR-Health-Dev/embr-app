import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { HotFlashReferenceLibrary } from "./hot-flash-reference-library";
import { HOT_FLASH_REFERENCE_SECTIONS } from "../content/hot-flash-reference-library";

function renderWithIntl(locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <HotFlashReferenceLibrary />
    </NextIntlClientProvider>,
  );
}

describe("HotFlashReferenceLibrary", () => {
  it("renders collapsed by default — a secondary, further-optional layer, not an always-visible article", () => {
    renderWithIntl();

    const toggle = screen.getByText("The science behind hot flashes");
    const details = toggle.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });

  it("renders every reference section's heading and body", () => {
    renderWithIntl();

    expect(screen.getByText("Hormonal signaling")).toBeInTheDocument();
    expect(screen.getByText("The KNDy / neurokinin / NK3 pathway")).toBeInTheDocument();
    expect(
      screen.getByText("Serotonin, norepinephrine, and other nonhormonal pathways"),
    ).toBeInTheDocument();
    expect(screen.getByText("Behavioral and psychological factors")).toBeInTheDocument();
    expect(screen.getByText("Context and lifestyle factors")).toBeInTheDocument();
    expect(screen.getByText("Treatment pathways clinicians consider")).toBeInTheDocument();
  });

  it("shows the treatment-pathways caveat distinguishing mechanism from a personal recommendation", () => {
    renderWithIntl();

    expect(screen.getByText(/not a recommendation for you/)).toBeInTheDocument();
    expect(screen.getByText(/EMBR doesn't select or recommend treatments/)).toBeInTheDocument();
  });

  it("shows the closing caveat that this is general literature, not a diagnosis or cause of the user's own symptoms", () => {
    renderWithIntl();

    expect(
      screen.getByText(
        "This section summarizes general scientific and clinical literature on hot flashes. It isn't a diagnosis, an explanation of the cause of your own symptoms, or medical advice.",
      ),
    ).toBeInTheDocument();
  });

  it("cites a real, linkable source for every section", () => {
    renderWithIntl();

    // A source can legitimately back more than one section (e.g. the
    // NICE guideline backs both the behavioral and treatment-pathways
    // sections), so its URL renders more than once — assert on the
    // distinct set of cited URLs, not a 1:1 section-to-link count.
    const citedUrls = new Set(
      HOT_FLASH_REFERENCE_SECTIONS.flatMap((section) => section.sources.map((s) => s.url)),
    );
    for (const url of citedUrls) {
      const links = screen.getAllByRole("link", { name: url });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute("href", url);
      }
    }
  });

  it("renders in Japanese too, including the treatment-pathways caveat", () => {
    renderWithIntl("ja");

    expect(screen.getByText("ホットフラッシュの科学的背景")).toBeInTheDocument();
    expect(screen.getByText("KNDy / ニューロキニン / NK3 経路")).toBeInTheDocument();
    expect(screen.getByText(/EMBRが治療を選択・推奨することはありません/)).toBeInTheDocument();
  });
});
