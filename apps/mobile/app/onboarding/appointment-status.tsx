import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

const OPTIONS: { value: string; label: string }[] = [
  { value: "WITHIN_MONTH", label: "Yes, within the next month" },
  { value: "UNSURE_WHEN", label: "Yes, but I'm not sure when" },
  { value: "NO", label: "No" },
  { value: "UNSURE", label: "I'm not sure yet" },
];

export default function AppointmentStatusScreen() {
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
      <Text style={styles.headline}>Do you have a healthcare appointment coming up?</Text>
      <Text style={styles.hint}>
        No need for the exact date yet. Just helps us know whether to keep BRIEF close at hand.
      </Text>
      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => void handleSelect(opt.value)}
              style={styles.row}
            >
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                {opt.label}
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
