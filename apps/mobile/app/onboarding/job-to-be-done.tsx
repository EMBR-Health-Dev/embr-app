import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

const OPTIONS: { value: string; label: string }[] = [
  { value: "UNDERSTAND_EXPERIENCE", label: "Understand what I'm experiencing" },
  { value: "UNDERSTAND_PATTERNS", label: "Understand patterns over time" },
  { value: "PREPARE_FOR_APPOINTMENT", label: "Prepare for a healthcare conversation" },
  { value: "KEEP_RECORD", label: "Keep a better record, long term" },
  { value: "NOT_SURE", label: "Not sure yet" },
];

export default function JobToBeDoneScreen() {
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
      <Text style={styles.headline}>What do you want EMBR to help you with?</Text>
      <Text style={styles.hint}>
        This just shapes what we show you first. You can always change your mind later.
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
