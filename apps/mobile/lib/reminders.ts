import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

/**
 * One optional daily reminder to check in. It is a local notification
 * scheduled on this phone: no server, no push token, nothing sent
 * anywhere. The text is deliberately generic ("A minute for today's
 * check in") so a lock screen never shows anything about her health.
 * Off unless she turns it on.
 */

const STORAGE_KEY = "embr_daily_reminder";
const NOTIFICATION_ID = "embr-daily-reminder";
const ANDROID_CHANNEL = "reminders";

/** Preset times offered in Settings, as [hour, minute]. */
export const REMINDER_TIMES = [
  [8, 0],
  [12, 30],
  [18, 0],
  [21, 0],
] as const;

export interface ReminderSetting {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER: ReminderSetting = { enabled: false, hour: 21, minute: 0 };

/** Local notifications are not available in the web build. */
export const remindersSupported = Platform.OS !== "web";

export async function loadReminder(): Promise<ReminderSetting> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDER;
    const parsed = JSON.parse(raw) as Partial<ReminderSetting>;
    if (
      typeof parsed.enabled === "boolean" &&
      typeof parsed.hour === "number" &&
      typeof parsed.minute === "number"
    ) {
      return { enabled: parsed.enabled, hour: parsed.hour, minute: parsed.minute };
    }
  } catch {
    // Unreadable or corrupt: fall back to off.
  }
  return DEFAULT_REMINDER;
}

export type ReminderResult = "scheduled" | "cancelled" | "denied";

/**
 * Saves the setting and makes the phone match it: one daily reminder at
 * the chosen time, or none. Asks for notification permission only when
 * she turns it on; if she declines, nothing is scheduled and the saved
 * setting stays off.
 */
export async function applyReminder(
  setting: ReminderSetting,
  copy: { title: string; body: string; channelName: string },
): Promise<ReminderResult> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  if (!setting.enabled) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(setting));
    return "cancelled";
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ ...setting, enabled: false }));
    return "denied";
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: copy.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title: copy.title, body: copy.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: setting.hour,
      minute: setting.minute,
      ...(Platform.OS === "android" && { channelId: ANDROID_CHANNEL }),
    },
  });
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(setting));
  return "scheduled";
}

/**
 * After a language change, reschedule an existing reminder so its text
 * is in the new language. Never asks for permission and never turns a
 * reminder on.
 */
export async function refreshReminderText(copy: {
  title: string;
  body: string;
  channelName: string;
}): Promise<void> {
  if (!remindersSupported) return;
  const setting = await loadReminder();
  if (!setting.enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await applyReminder(setting, copy);
}

/** On sign out: remove the reminder and forget the setting. */
export async function clearReminder(): Promise<void> {
  if (!remindersSupported) return;
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
  await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
}

/** "21:00" style, in her language's own clock format. */
export function formatReminderTime(hour: number, minute: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hour, minute),
  );
}
