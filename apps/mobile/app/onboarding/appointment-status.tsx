import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

const OPTION_VALUES = ["WITHIN_MONTH", "UNSURE_WHEN", "NO", "UNSURE"] as const;
const OPTION_KEYS: Record<(typeof OPTION_VALUES)[number], string> = {
  WITHIN_MONTH: "withinMonth",
  UNSURE_WHEN: "unsureWhen",
  NO: "no",
  UNSURE: "unsure",
};

export default function AppointmentStatusScreen() {
  const { t } = useTranslation();
  const { patch } = useOnboarding();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleSelect(value: string) {
    if (selected) return;
    setSelected(value);
    await patch({ appointmentStatus: value, currentStep: "THE_LOOP" });
    setTimeout(() => router.push(STEP_ROUTES.THE_LOOP), 320);
  }

  return (
    <OnboardingScreen step="APPOINTMENT_STATUS">
      <Text style={styles.headline}>{t("onboarding.appointmentStatus.headline")}</Text>
      <Text style={styles.hint}>{t("onboarding.appointmentStatus.hint")}</Text>
      <View style={styles.list}>
        {OPTION_VALUES.map((value) => {
          const isSelected = selected === value;
          return (
            <Pressable key={value} onPress={() => void handleSelect(value)} style={styles.row}>
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                {t(`onboarding.appointmentStatus.${OPTION_KEYS[value]}`)}
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
