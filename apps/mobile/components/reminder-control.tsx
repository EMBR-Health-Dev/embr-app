import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip } from "./chip";
import { theme } from "../lib/theme";
import {
  REMINDER_TIMES,
  applyReminder,
  formatReminderTime,
  loadReminder,
  type ReminderSetting,
} from "../lib/reminders";

export function ReminderControl() {
  const { t, i18n } = useTranslation();
  const [setting, setSetting] = useState<ReminderSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"denied" | "error" | null>(null);

  useEffect(() => {
    void loadReminder().then(setSetting);
  }, []);

  async function update(next: ReminderSetting) {
    setSaving(true);
    setMessage(null);
    try {
      const result = await applyReminder(next, {
        title: t("reminder.title"),
        body: t("reminder.body"),
        channelName: t("reminder.channelName"),
      });
      if (result === "denied") {
        setSetting({ ...next, enabled: false });
        setMessage("denied");
      } else {
        setSetting(next);
      }
    } catch {
      setMessage("error");
    } finally {
      setSaving(false);
    }
  }

  if (!setting) return null;
  const time = formatReminderTime(setting.hour, setting.minute, i18n.language);

  return (
    <View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t("settings.reminderToggle")}</Text>
        <Switch
          accessibilityLabel={t("settings.reminderToggle")}
          value={setting.enabled}
          disabled={saving}
          onValueChange={(enabled) => void update({ ...setting, enabled })}
        />
      </View>
      {setting.enabled && (
        <>
          <Text style={styles.label}>{t("settings.reminderTimeLabel")}</Text>
          <View style={styles.chips}>
            {REMINDER_TIMES.map(([hour, minute]) => (
              <Chip
                key={`${hour}:${minute}`}
                label={formatReminderTime(hour, minute, i18n.language)}
                selected={setting.hour === hour && setting.minute === minute}
                onPress={() => {
                  if (!saving) void update({ enabled: true, hour, minute });
                }}
              />
            ))}
          </View>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {t("settings.reminderOnAt", { time })}
          </Text>
        </>
      )}
      {message && (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {message === "denied" ? t("settings.reminderDenied") : t("settings.reminderError")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  switchLabel: { fontSize: 15, color: theme.colors.textPrimary, flex: 1, paddingRight: 12 },
  label: { marginTop: 8, fontSize: 13, color: theme.colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  status: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted },
});
