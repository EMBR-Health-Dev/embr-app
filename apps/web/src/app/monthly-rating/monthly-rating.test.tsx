import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/monthly-rating",
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "person@example.test", emailVerified: true },
    loading: false,
    logout: vi.fn(),
  }),
}));

const list = vi.fn();
const save = vi.fn();
const remove = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    mrsCheckIns: {
      list: (...a: unknown[]) => list(...a),
      save: (...a: unknown[]) => save(...a),
      delete: (...a: unknown[]) => remove(...a),
    },
  },
}));

const ANSWERS = {
  hotFlushes: 3,
  heartDiscomfort: 1,
  sleepProblems: 4,
  depressiveMood: 2,
  irritability: 1,
  anxiety: 0,
  exhaustion: 3,
  sexualProblems: 1,
  bladderProblems: 0,
  vaginalDryness: 2,
  jointMuscular: 2,
};

function checkIn(
  completedOn: string,
  total: number,
  somatic = 10,
  psychological = 6,
  urogenital = 3,
) {
  return {
    id: completedOn,
    completedOn,
    locale: "en",
    instrumentVersion: "MRS-EN-2003",
    answers: ANSWERS,
    scores: { total, somatic, psychological, urogenital },
    createdAt: `${completedOn}T08:00:00Z`,
    updatedAt: `${completedOn}T08:00:00Z`,
  };
}

let Page: React.ComponentType;

async function renderPage(locale = "en") {
  Page = (await import("./page")).default;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Page />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_MRS_CHECK_IN_ENABLED = "true";
  replace.mockReset();
  list.mockReset();
  save.mockReset();
  remove.mockReset();
});

describe("Monthly rating page", () => {
  it("sends her to the dashboard while the switch is off", async () => {
    process.env.NEXT_PUBLIC_MRS_CHECK_IN_ENABLED = "false";
    await renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(list).not.toHaveBeenCalled();
  });

  it("is not offered in Japanese until the validated version is licensed", async () => {
    await renderPage("ja");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("asks all 11 questions and saves only once every one is answered", async () => {
    list.mockResolvedValue([]);
    save.mockImplementation((date: string) => Promise.resolve(checkIn(date, 19)));
    const user = userEvent.setup();
    await renderPage();

    const question = await screen.findByText(
      "Which of the following symptoms apply to you at this time?",
    );
    const groups = within(question.closest("form")!).getAllByRole("group");
    expect(groups).toHaveLength(11);
    const submit = screen.getByRole("button", { name: "Save my answers" });
    expect(submit).toBeDisabled();

    const labels = Object.keys(ANSWERS) as (keyof typeof ANSWERS)[];
    const answerNames = ["None", "Mild", "Moderate", "Severe", "Extremely severe"];
    for (const [i, group] of groups.entries()) {
      await user.click(
        within(group).getByRole("radio", { name: answerNames[ANSWERS[labels[i]!]] }),
      );
    }
    expect(screen.getByText("11 of 11 answered")).toBeInTheDocument();
    await user.click(submit);

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![1]).toEqual(ANSWERS);
    expect(await screen.findByText("19 of 44")).toBeInTheDocument();
  });

  it("shows scores and change as numbers, never a severity label", async () => {
    list.mockResolvedValue([checkIn("2026-01-05", 22, 12, 7, 3), checkIn("2026-02-05", 19)]);
    await renderPage();

    expect(await screen.findByText("19 of 44")).toBeInTheDocument();
    expect(screen.getByText("10 of 16")).toBeInTheDocument();
    expect(screen.getAllByText(/lower than on/).length).toBeGreaterThan(0);
    // The scores themselves carry no band; only the scale explanation
    // names the answer anchors.
    const scores = screen.getByRole("region", { name: "Your scores" });
    expect(scores.querySelector("dl")!.textContent).not.toMatch(/mild|moderate|severe|little/i);
  });

  it("deletes a rating only after she confirms", async () => {
    list.mockResolvedValue([checkIn("2026-02-05", 19)]);
    remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: /Delete the rating from/ }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("2026-02-05"));
  });
});
