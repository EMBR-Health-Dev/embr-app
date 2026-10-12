import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void store.delete(k)),
}));

const notifications = {
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => "id"),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
};
vi.mock("expo-notifications", () => notifications);
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const copy = {
  title: "EMBR",
  body: "A minute for today's check in.",
  channelName: "Daily reminder",
};

beforeEach(() => {
  store.clear();
  Object.values(notifications).forEach((v) => typeof v === "function" && v.mockClear?.());
  notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  notifications.requestPermissionsAsync.mockResolvedValue({ granted: true });
});

describe("daily reminder", () => {
  it("is off until she turns it on", async () => {
    const { loadReminder } = await import("../lib/reminders");
    expect(await loadReminder()).toEqual({ enabled: false, hour: 21, minute: 0 });
  });

  it("schedules one daily local notification with generic text and remembers the time", async () => {
    const { applyReminder, loadReminder } = await import("../lib/reminders");
    expect(await applyReminder({ enabled: true, hour: 8, minute: 0 }, copy)).toBe("scheduled");

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "embr-daily-reminder",
      content: { title: "EMBR", body: "A minute for today's check in." },
      trigger: { type: "daily", hour: 8, minute: 0 },
    });
    expect(await loadReminder()).toEqual({ enabled: true, hour: 8, minute: 0 });
  });

  it("replaces the previous reminder instead of adding a second one", async () => {
    const { applyReminder } = await import("../lib/reminders");
    await applyReminder({ enabled: true, hour: 8, minute: 0 }, copy);
    await applyReminder({ enabled: true, hour: 21, minute: 0 }, copy);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "embr-daily-reminder",
    );
  });

  it("asks for permission only when turning it on, and stays off if declined", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    const { applyReminder, loadReminder } = await import("../lib/reminders");

    expect(await applyReminder({ enabled: true, hour: 8, minute: 0 }, copy)).toBe("denied");
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect((await loadReminder()).enabled).toBe(false);
  });

  it("turning it off cancels without asking for anything", async () => {
    const { applyReminder } = await import("../lib/reminders");
    expect(await applyReminder({ enabled: false, hour: 8, minute: 0 }, copy)).toBe("cancelled");
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("re-writes the text after a language change only if it is already on", async () => {
    const { applyReminder, refreshReminderText } = await import("../lib/reminders");
    await refreshReminderText(copy);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    await applyReminder({ enabled: true, hour: 8, minute: 0 }, copy);
    notifications.scheduleNotificationAsync.mockClear();
    await refreshReminderText({ ...copy, body: "今日のチェックインを1分で。" });
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: { title: "EMBR", body: "今日のチェックインを1分で。" } }),
    );
  });

  it("is removed on sign out", async () => {
    const { applyReminder, clearReminder, loadReminder } = await import("../lib/reminders");
    await applyReminder({ enabled: true, hour: 8, minute: 0 }, copy);
    await clearReminder();
    expect((await loadReminder()).enabled).toBe(false);
  });
});
