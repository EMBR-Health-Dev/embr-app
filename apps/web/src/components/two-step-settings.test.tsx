import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { ApiError } from "../lib/api-client";

const flags = vi.hoisted(() => ({ setupEnabled: true }));
vi.mock("../lib/mfa", () => ({
  get MFA_SETUP_ENABLED() {
    return flags.setupEnabled;
  },
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

const statusMock = vi.fn();
const setupMock = vi.fn();
const confirmMock = vi.fn();
const disableMock = vi.fn();
const regenerateMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    auth: {
      mfa: {
        status: (...a: unknown[]) => statusMock(...a),
        setup: (...a: unknown[]) => setupMock(...a),
        confirm: (...a: unknown[]) => confirmMock(...a),
        disable: (...a: unknown[]) => disableMock(...a),
        regenerateRecoveryCodes: (...a: unknown[]) => regenerateMock(...a),
      },
    },
  },
}));

const CODES = Array.from({ length: 10 }, (_, i) => `ABCDE-FGH${i}K`);

async function renderSection() {
  const { TwoStepSettings } = await import("./two-step-settings");
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TwoStepSettings />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  flags.setupEnabled = true;
  for (const m of [statusMock, setupMock, confirmMock, disableMock, regenerateMock]) {
    m.mockReset();
  }
});

describe("Settings — two-step sign in", () => {
  it("is hidden while setup is switched off and she doesn't have it on", async () => {
    flags.setupEnabled = false;
    statusMock.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    await renderSection();
    await waitFor(() => expect(statusMock).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Two-step sign in" })).toBeNull();
  });

  it("still lets her manage it when it is on, even with setup switched off", async () => {
    flags.setupEnabled = false;
    statusMock.mockResolvedValue({ enabled: true, recoveryCodesLeft: 7 });
    await renderSection();
    expect(await screen.findByText("Two-step sign in is on.")).toBeInTheDocument();
    expect(screen.getByText("You have 7 recovery codes left.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });

  it("sets up in two steps and shows the recovery codes once", async () => {
    statusMock.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    setupMock.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/EMBR%3Ap%40e.x?secret=JBSWY3DPEHPK3PXP",
    });
    const user = userEvent.setup();
    await renderSection();
    await user.click(await screen.findByRole("button", { name: "Set up two-step sign in" }));

    expect(await screen.findByRole("img", { name: /QR code to add EMBR/ })).toHaveAttribute(
      "src",
      "data:image/png;base64,qr",
    );
    // The key, grouped for typing by hand.
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    // Not six digits: nothing is sent.
    await user.type(screen.getByLabelText("6 digit code from your app"), "12");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the 6 digit code from your app.")).toBeInTheDocument();

    confirmMock.mockResolvedValue({ recoveryCodes: CODES });
    statusMock.mockResolvedValue({ enabled: true, recoveryCodesLeft: 10 });
    await user.clear(screen.getByLabelText("6 digit code from your app"));
    await user.type(screen.getByLabelText("6 digit code from your app"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(confirmMock).toHaveBeenCalledWith("123456");
    const list = await screen.findByRole("list", { name: "Your recovery codes" });
    expect(list.querySelectorAll("li")).toHaveLength(10);

    await user.click(screen.getByRole("button", { name: "I’ve saved them" }));
    expect(await screen.findByText("Two-step sign in is on.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Your recovery codes" })).toBeNull();
  });

  it("shows the server's answer when the first code is wrong", async () => {
    statusMock.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    setupMock.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/x" });
    confirmMock.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "That code is not right"));
    const user = userEvent.setup();
    await renderSection();
    await user.click(await screen.findByRole("button", { name: "Set up two-step sign in" }));
    await user.type(await screen.findByLabelText("6 digit code from your app"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("That code is not right")).toBeInTheDocument();
  });

  it("turns off with her password and a code", async () => {
    statusMock.mockResolvedValue({ enabled: true, recoveryCodesLeft: 10 });
    disableMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection();
    await user.click(await screen.findByRole("button", { name: "Turn off" }));

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(disableMock).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your password and a code from your app.")).toBeInTheDocument();

    statusMock.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 });
    await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
    await user.type(screen.getByLabelText("Code from your app, or a recovery code"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn off" }));

    expect(disableMock).toHaveBeenCalledWith({ password: "Sup3rSecret!Pass", code: "123456" });
    expect(await screen.findByText("Two-step sign in is off.")).toBeInTheDocument();
  });

  it("replaces the recovery codes after a current code", async () => {
    statusMock.mockResolvedValue({ enabled: true, recoveryCodesLeft: 1 });
    regenerateMock.mockResolvedValue({ recoveryCodes: CODES });
    const user = userEvent.setup();
    await renderSection();
    expect(await screen.findByText("You have 1 recovery code left.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Get new recovery codes" }));
    await user.type(screen.getByLabelText("Code from your app, or a recovery code"), "654321");
    await user.click(screen.getByRole("button", { name: "Get new recovery codes" }));

    expect(regenerateMock).toHaveBeenCalledWith("654321");
    expect(await screen.findByRole("list", { name: "Your recovery codes" })).toBeInTheDocument();
  });
});
