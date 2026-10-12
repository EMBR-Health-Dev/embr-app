import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { theme } from "../lib/theme";
import { setLifeStageCache, useLifeStage } from "../lib/life-stage";

// null is "Prefer not to say": choosing it clears the stored answer.
const OPTIONS = [
  { value: "PERIMENOPAUSE", key: "perimenopause" },
  { value: "POSTMENOPAUSE", key: "postmenopause" },
  { value: "NOT_SURE", key: "notSure" },
  { value: null, key: "preferNotToSay" },
] as const;

export function LifeStageControl() {
  const { t } = useTranslation();
  const current = useLifeStage();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  async function choose(next: string | null) {
    if (next === current || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const profile = await api.onboarding.patch({ lifeStage: next });
      setLifeStageCache(profile.lifeStage);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (current === undefined) return null;

  return (
    <View>
      <View accessibilityRole="radiogroup" style={styles.list}>
        {OPTIONS.map(({ value, key }) => {
          const selected = value === current;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={saving}
              onPress={() => void choose(value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {t(`settings.lifeStage.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {status && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status === "saved" ? t("settings.lifeStageSaved") : t("settings.lifeStageError")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginTop: 4 },
  option: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  optionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  optionLabel: { fontSize: 15, color: theme.colors.textPrimary },
  optionLabelSelected: { color: theme.colors.primaryForeground },
  status: { marginTop: 8, fontSize: 13, color: theme.colors.textMuted },
});
