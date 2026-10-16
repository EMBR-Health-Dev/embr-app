import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { toIsoDate } from "../lib/date-format";
import { theme } from "../lib/theme";
import { DatePickerField } from "./date-picker-field";

/** A YYYY-MM-DD string as a local Date, so the picker shows that day. */
function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Her last period, as she reports it: for when it came before she used
 * EMBR or she has stopped logging periods. Same rules as the web control
 * (apps/web/src/components/last-period-control.tsx): shown in her BRIEF,
 * never inferred, never sent to the AI.
 */
export function LastPeriodControl() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "removed" | "error" | null>(null);

  useEffect(() => {
    api.onboarding
      .get()
      .then((profile) => {
        setSaved(profile.lastPeriodDate);
        setPicked(profile.lastPeriodDate ? fromIsoDate(profile.lastPeriodDate) : null);
      })
      .catch(() => setSaved(null));
  }, []);

  async function save(next: string | null) {
    setSaving(true);
    setStatus(null);
    try {
      const profile = await api.onboarding.patch({ lastPeriodDate: next });
      setSaved(profile.lastPeriodDate);
      setPicked(profile.lastPeriodDate ? fromIsoDate(profile.lastPeriodDate) : null);
      setStatus(next === null ? "removed" : "saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (saved === undefined) return null;

  const pickedIso = picked ? toIsoDate(picked) : null;
  const canSave = !saving && pickedIso !== null && pickedIso !== saved;

  return (
    <View>
      <View style={styles.row}>
        <DatePickerField
          label={t("settings.lastPeriodLabel")}
          value={picked}
          onChange={setPicked}
          maximumDate={new Date()}
          minimumDate={new Date(1950, 0, 1)}
        />
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={() => void save(pickedIso)}
          style={[styles.save, !canSave && styles.disabled]}
        >
          <Text style={styles.saveText}>
            {saving ? t("settings.lastPeriodSaving") : t("settings.lastPeriodSave")}
          </Text>
        </Pressable>
        {saved && (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save(null)}
            style={styles.remove}
          >
            <Text style={styles.removeText}>{t("settings.lastPeriodRemove")}</Text>
          </Pressable>
        )}
      </View>
      {status && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status === "saved"
            ? t("settings.lastPeriodSaved")
            : status === "removed"
              ? t("settings.lastPeriodRemoved")
              : t("settings.lastPeriodError")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  save: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  disabled: { opacity: 0.6 },
  saveText: { fontSize: 15, fontWeight: "600", color: theme.colors.primaryForeground },
  remove: { minHeight: 44, justifyContent: "center" },
  removeText: { fontSize: 15, color: theme.colors.textMuted, textDecorationLine: "underline" },
  status: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted },
});
