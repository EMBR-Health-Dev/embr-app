// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the documented instance API; same suppression as brief.test.tsx. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "../../locales/en.json";

const onboardingGetMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    cycleEntries: {
      list: vi.fn().mockResolvedValue({ items: [] }),
      upsert: vi.fn(),
    },
    onboarding: { get: (...args: unknown[]) => onboardingGetMock(...args) },
  },
}));

vi.mock("../../lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
}));

// A fresh user id per test, so the shared life stage cache refetches.
let userId = 0;
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: `u${userId}` } }),
}));

beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  userId += 1;
  onboardingGetMock.mockReset();
});

async function renderCycle() {
  const { default: CycleScreen } = await import("../../app/(app)/cycle");
  render(
    <I18nextProvider i18n={i18next}>
      <CycleScreen />
    </I18nextProvider>,
  );
}

describe("Cycle screen and life stage", () => {
  it("keeps period start and end when she has not said she is postmenopausal", async () => {
    onboardingGetMock.mockResolvedValue({ lifeStage: "PERIMENOPAUSE" });
    await renderCycle();

    expect(await screen.findByText("Period started today")).toBeTruthy();
    expect(screen.getByText(en.cycle.title)).toBeTruthy();
  });

  it("becomes a bleeding log, still saveable, with no period start or end", async () => {
    onboardingGetMock.mockResolvedValue({ lifeStage: "POSTMENOPAUSE" });
    await renderCycle();

    expect(await screen.findByText("Bleeding or spotting")).toBeTruthy();
    expect(screen.getByText(en.cycle.bleedingHint)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Period started today")).toBeNull());
    expect(screen.queryByText("Period ended today")).toBeNull();
    expect(screen.getByText(en.cycle.saveTodaysEntry)).toBeTruthy();
  });
});
