import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

// PREFER_NOT_TO_SAY is a client-only choice: it advances without
// storing anything, so lifeStage stays null.
const OPTION_VALUES = ["PERIMENOPAUSE", "POSTMENOPAUSE", "NOT_SURE", "PREFER_NOT_TO_SAY"] as const;
const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  PERIMENOPAUSE: "perimenopause",
  POSTMENOPAUSE: "postmenopause",
  NOT_SURE: "notSure",
  PREFER_NOT_TO_SAY: "preferNotToSay",
};

export default function LifeStageScreen() {
  const { t } = useTranslation();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: (typeof OPTION_VALUES)[number]) {
    if (selected) return;
    setSelected(value);
    await patch({
      ...(value !== "PREFER_NOT_TO_SAY" && { lifeStage: value }),
      currentStep: "WHATS_GOING_ON",
    });
    setTimeout(() => router.push(STEP_ROUTES.WHATS_GOING_ON), 320);
  }

  return (
    <OnboardingScreen step="LIFE_STAGE">
      <Text style={styles.headline}>{t("onboarding.lifeStage.headline")}</Text>
      <Text style={styles.hint}>{t("onboarding.lifeStage.hint")}</Text>
      <View style={styles.list}>
        {OPTION_VALUES.map((value) => {
          const isSelected = selected === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={value}
              onPress={() => void handleSelect(value)}
              style={styles.row}
            >
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                {t(`onboarding.lifeStage.${OPTION_KEYS[value]}`)}
              </Text>
              <View style={[styles.dot, isSelected && styles.dotSelected]} />
            </Pressable>
          );
        })}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: "500", color: theme.colors.textPrimary },
  hint: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  list: { marginTop: 28 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { fontSize: 15, color: theme.colors.textSecondary, flex: 1, paddingRight: 12 },
  rowLabelSelected: { color: theme.colors.textPrimary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "transparent" },
  dotSelected: { backgroundColor: theme.colors.accent },
});
