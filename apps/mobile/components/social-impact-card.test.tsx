// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the documented instance API; same suppression as test/screens/brief.test.tsx. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ContextLogDto } from "@embr/types";
import en from "../locales/en.json";
import { toIsoDate } from "../lib/date-format";

const listMock = vi.fn();
const upsertMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    contextLogs: {
      list: (...args: unknown[]) => listMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
}));

// The real module pulls in expo-secure-store; only ApiError is used.
vi.mock("../lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
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

const today = toIsoDate(new Date());

function entry(overrides: Partial<ContextLogDto> = {}): ContextLogDto {
  return {
    id: "ctx-1",
    date: today,
    sleepDuration: null,
    caffeineAfternoon: null,
    alcohol: null,
    stressLevel: null,
    nightSweats: null,
    workImpact: null,
    exercise: null,
    socialImpact: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function page(items: ContextLogDto[]) {
  return { items, page: 1, pageSize: 1, total: items.length, totalPages: 1 };
}

async function renderCard() {
  const { SocialImpactCard } = await import("./social-impact-card");
  render(
    <I18nextProvider i18n={i18next}>
      <SocialImpactCard />
    </I18nextProvider>,
  );
  await waitFor(() => expect(listMock).toHaveBeenCalled());
}

// A selected Chip draws a check mark (see components/chip.tsx).
function isSelected(label: string) {
  return screen.getByLabelText(label).textContent?.includes("✓") ?? false;
}

beforeEach(() => {
  listMock.mockReset();
  upsertMock
    .mockReset()
    .mockImplementation((input: Partial<ContextLogDto>) => Promise.resolve(entry(input)));
});

describe("SocialImpactCard", () => {
  it("asks the question, defaults to Not logged and says it is never shared with an employer", async () => {
    listMock.mockResolvedValue(page([]));
    await renderCard();

    expect(
      screen.getByText("Did symptoms affect time with family or friends today?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/never shared with an employer/)).toBeInTheDocument();
    await waitFor(() => expect(isSelected("Not logged")).toBe(true));
  });

  it("saves the answer and sends today's work answer back unchanged", async () => {
    listMock.mockResolvedValue(
      page([entry({ sleepDuration: "UNDER_6H", workImpact: "DID_LESS", alcohol: false })]),
    );
    await renderCard();

    fireEvent.click(screen.getByLabelText("Yes, I missed or cancelled plans"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0]![0]).toEqual({
      date: today,
      sleepDuration: "UNDER_6H",
      caffeineAfternoon: undefined,
      alcohol: false,
      stressLevel: undefined,
      nightSweats: undefined,
      workImpact: "DID_LESS",
      socialImpact: "MISSED_PLANS",
    });
    expect(await screen.findByText("Saved ✓")).toBeInTheDocument();
  });

  it("sends Not logged as null, which clears an earlier answer", async () => {
    listMock.mockResolvedValue(page([entry({ socialImpact: "DID_LESS" })]));
    await renderCard();
    await waitFor(() => expect(isSelected("Yes, I joined in less")).toBe(true));

    fireEvent.click(screen.getByLabelText("Not logged"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0]![0].socialImpact).toBeNull();
  });

  it("turns saving off when today's entry cannot be loaded", async () => {
    listMock.mockRejectedValue(new Error("offline"));
    await renderCard();

    expect(
      await screen.findByText(/saving is off to keep what you logged elsewhere/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("No"));
    fireEvent.click(screen.getByText("Save"));
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
