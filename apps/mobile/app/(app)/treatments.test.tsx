// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the documented instance API; same suppression as brief.test.tsx. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Pressable, Text } from "react-native";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import type { TreatmentDto } from "@embr/types";
import en from "../../locales/en.json";

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    treatments: {
      list: (...args: unknown[]) => listMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: vi.fn(),
      impact: vi.fn(),
    },
  },
}));

vi.mock("../../lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
}));

// The native date picker can't be driven in jsdom (see brief.test.tsx);
// this stand-in sets a fixed date when pressed.
vi.mock("../../components/date-picker-field", () => ({
  DatePickerField: ({ label, onChange }: { label: string; onChange: (date: Date) => void }) => (
    <Pressable onPress={() => onChange(new Date(2026, 8, 10))}>
      <Text>{label}</Text>
    </Pressable>
  ),
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

function treatment(overrides: Partial<TreatmentDto> = {}): TreatmentDto {
  return {
    id: "t1",
    name: "Estradiol patch",
    category: "HRT",
    startDate: "2026-06-01",
    endDate: null,
    stopReason: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function page(items: TreatmentDto[]) {
  return { items, page: 1, pageSize: 50, total: items.length, totalPages: 1 };
}

async function renderScreen() {
  const { default: TreatmentsScreen } = await import("./treatments");
  render(
    <I18nextProvider i18n={i18next}>
      <TreatmentsScreen />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  listMock.mockReset();
  createMock.mockReset().mockResolvedValue(treatment());
  updateMock.mockReset();
});

describe("Treatments screen — why did you stop", () => {
  it("offers the reasons only once Stopped is chosen, and sends the picked one", async () => {
    listMock.mockResolvedValue(page([]));
    await renderScreen();

    expect(screen.queryByText("Why did you stop? (optional)")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(en.treatments.namePlaceholder), {
      target: { value: "Black cohosh" },
    });
    fireEvent.click(screen.getByLabelText("HRT"));
    fireEvent.click(screen.getByLabelText("Stopped"));
    fireEvent.click(screen.getByText("End date"));
    expect(screen.getByText("Why did you stop? (optional)")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Cost"));
    fireEvent.click(screen.getByText("Add treatment"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      endDate: "2026-09-10",
      stopReason: "COST",
    });
  });

  it("shows the reason on an ended treatment, none on an ongoing one, and lets her change it", async () => {
    listMock.mockResolvedValue(
      page([
        treatment({ endDate: "2026-07-01", stopReason: "SIDE_EFFECTS" }),
        treatment({ id: "t2", name: "Magnesium", category: "SUPPLEMENT" }),
      ]),
    );
    updateMock.mockResolvedValue(
      treatment({ endDate: "2026-07-01", stopReason: "NO_LONGER_NEEDED" }),
    );
    await renderScreen();

    expect(await screen.findByText("Reason for stopping: Side effects")).toBeInTheDocument();
    expect(screen.getAllByText(/Reason for stopping|No reason given/)).toHaveLength(1);

    fireEvent.click(screen.getByText("Change"));
    fireEvent.click(screen.getByLabelText("No longer needed"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", { stopReason: "NO_LONGER_NEEDED" }),
    );
    expect(await screen.findByText("Reason for stopping: No longer needed")).toBeInTheDocument();
  });

  it("lets her add a reason to an ended treatment that has none", async () => {
    listMock.mockResolvedValue(page([treatment({ endDate: "2026-07-01" })]));
    updateMock.mockResolvedValue(
      treatment({ endDate: "2026-07-01", stopReason: "PREFER_NOT_TO_SAY" }),
    );
    await renderScreen();

    expect(await screen.findByText("No reason given")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Add a reason"));
    fireEvent.click(screen.getByLabelText("Prefer not to say"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", { stopReason: "PREFER_NOT_TO_SAY" }),
    );
  });
});
