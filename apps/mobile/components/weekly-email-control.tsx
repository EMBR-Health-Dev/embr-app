import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { theme } from "../lib/theme";

/** The weekly reminder email: off until she turns it on. Same API and
 * copy as the web control (apps/web/src/components/weekly-email-control.tsx). */
export function WeeklyEmailControl() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.notifications
      .get()
      .then((prefs) => setEnabled(prefs.weeklyEmail))
      .catch(() => setEnabled(false));
  }, []);

  async function update(next: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      const prefs = await api.notifications.patch({ weeklyEmail: next });
      setEnabled(prefs.weeklyEmail);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t("settings.weeklyEmailToggle")}</Text>
        <Switch
          accessibilityLabel={t("settings.weeklyEmailToggle")}
          value={enabled}
          disabled={saving}
          onValueChange={(next) => void update(next)}
        />
      </View>
      {(enabled || failed) && (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {failed ? t("settings.weeklyEmailError") : t("settings.weeklyEmailOn")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
    marginTop: 4,
  },
  switchLabel: { flex: 1, fontSize: 15, color: theme.colors.textPrimary },
  status: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted },
});
