import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

const OPTION_VALUES = [
  "UNDERSTAND_EXPERIENCE",
  "UNDERSTAND_PATTERNS",
  "PREPARE_FOR_APPOINTMENT",
  "KEEP_RECORD",
  "NOT_SURE",
] as const;

const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  UNDERSTAND_EXPERIENCE: "understandExperience",
  UNDERSTAND_PATTERNS: "understandPatterns",
  PREPARE_FOR_APPOINTMENT: "prepareForAppointment",
  KEEP_RECORD: "keepRecord",
  NOT_SURE: "notSure",
};

export default function JobToBeDoneScreen() {
  const { t } = useTranslation();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: string) {
    if (selected) return;
    setSelected(value);
    await patch({ jobToBeDone: value, currentStep: "WHATS_GOING_ON" });
    setTimeout(() => router.push(STEP_ROUTES.WHATS_GOING_ON), 320);
  }

  return (
    <OnboardingScreen step="JOB_TO_BE_DONE">
      <Text style={styles.headline}>{t("onboarding.jobToBeDone.headline")}</Text>
      <Text style={styles.hint}>{t("onboarding.jobToBeDone.hint")}</Text>
      <View style={styles.list}>
        {OPTION_VALUES.map((value) => {
          const isSelected = selected === value;
          return (
            <Pressable key={value} onPress={() => void handleSelect(value)} style={styles.row}>
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                {t(`onboarding.jobToBeDone.${OPTION_KEYS[value]}`)}
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
