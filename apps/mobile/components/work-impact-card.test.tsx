// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the documented instance API; same suppression as app/(app)/brief.test.tsx. */
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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function page(items: ContextLogDto[]) {
  return { items, page: 1, pageSize: 1, total: items.length, totalPages: 1 };
}

async function renderCard() {
  const { WorkImpactCard } = await import("./work-impact-card");
  render(
    <I18nextProvider i18n={i18next}>
      <WorkImpactCard />
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

describe("WorkImpactCard", () => {
  it("asks the question, defaults to Not logged and says it is never shared with an employer", async () => {
    listMock.mockResolvedValue(page([]));
    await renderCard();

    expect(screen.getByText("Did symptoms affect your work today?")).toBeInTheDocument();
    expect(
      screen.getByText("Counted only in your own BRIEF. Never shared with an employer."),
    ).toBeInTheDocument();
    await waitFor(() => expect(isSelected("Not logged")).toBe(true));
    expect(listMock).toHaveBeenCalledWith({ from: today, to: today, pageSize: 1 });
  });

  it("saves the answer for today", async () => {
    listMock.mockResolvedValue(page([]));
    await renderCard();

    fireEvent.click(screen.getByLabelText("Yes, I missed time"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0]![0]).toMatchObject({ date: today, workImpact: "MISSED_TIME" });
    expect(await screen.findByText("Saved ✓")).toBeInTheDocument();
  });

  it("keeps everything else already logged today (for example on the web) when saving", async () => {
    listMock.mockResolvedValue(
      page([
        entry({
          sleepDuration: "UNDER_6H",
          stressLevel: "HIGH",
          nightSweats: "TWO_TO_THREE",
          alcohol: false,
          workImpact: "NONE",
        }),
      ]),
    );
    await renderCard();
    await waitFor(() => expect(isSelected("No")).toBe(true));

    fireEvent.click(screen.getByLabelText("Yes, I did less"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0]![0]).toEqual({
      date: today,
      sleepDuration: "UNDER_6H",
      caffeineAfternoon: undefined,
      alcohol: false,
      stressLevel: "HIGH",
      nightSweats: "TWO_TO_THREE",
      workImpact: "DID_LESS",
    });
  });

  it("sends Not logged as absent, never as no", async () => {
    listMock.mockResolvedValue(page([entry({ workImpact: "DID_LESS" })]));
    await renderCard();
    await waitFor(() => expect(isSelected("Yes, I did less")).toBe(true));

    fireEvent.click(screen.getByLabelText("Not logged"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0]![0].workImpact).toBeUndefined();
  });

  it("turns saving off when today's entry cannot be loaded, so nothing logged elsewhere is erased", async () => {
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
