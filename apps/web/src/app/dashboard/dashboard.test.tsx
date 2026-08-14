import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: "2026-01-01T00:00:00Z" },
    loading: false,
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    symptomLogs: { list: vi.fn().mockResolvedValue({ items: [] }) },
    onboarding: { get: vi.fn().mockResolvedValue({ jobToBeDone: null }) },
    organizations: { mine: vi.fn().mockResolvedValue([]) },
  },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Dashboard — translation", () => {
  it("renders English nav and section headers by default", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    expect(screen.getByText("Trends")).toBeInTheDocument();
    expect(screen.getByText("BRIEF")).toBeInTheDocument();
    expect(screen.getByText("Today's cycle entry")).toBeInTheDocument();
    expect(screen.getByText("Having a hot flash right now?")).toBeInTheDocument();
  });

  it("renders Japanese nav and section headers when that locale is active", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />, "ja");

    await waitFor(() => expect(screen.getByText("最近の症状")).toBeInTheDocument());
    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(screen.getByText("今日の周期記録")).toBeInTheDocument();
    expect(screen.getByText("今、ホットフラッシュが起きていますか?")).toBeInTheDocument();
  });

  it("translates symptom category options in the log form", async () => {
    const user = userEvent.setup();
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Log a different symptom")).toBeInTheDocument());
    await user.click(screen.getByText("Log a different symptom"));

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Hot Flash" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: "Brain Fog" })).toBeInTheDocument();
  });
});
