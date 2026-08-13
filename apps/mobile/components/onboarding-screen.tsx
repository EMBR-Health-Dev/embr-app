import { StyleSheet, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useOnboarding } from "../lib/onboarding-context";
import { ONBOARDING_STEPS, type OnboardingStep } from "../lib/onboarding-steps";
import { theme } from "../lib/theme";

export function OnboardingScreen({
  step,
  children,
}: {
  step: OnboardingStep;
  children: React.ReactNode;
}) {
  const { patch } = useOnboarding();
  const index = ONBOARDING_STEPS.indexOf(step);

  async function handleSkip() {
    await patch({ status: "skipped" });
    router.replace("/(app)");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.progress} accessibilityElementsHidden>
            {ONBOARDING_STEPS.map((s, i) => (
              <View
                key={s}
                style={[styles.progressDash, i <= index && styles.progressDashActive]}
              />
            ))}
          </View>
          <Pressable onPress={() => void handleSkip()}>
            <Text style={styles.skipText}>Skip to dashboard</Text>
          </Pressable>
        </View>

        <View style={styles.body}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, paddingHorizontal: 24, paddingVertical: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progress: { flexDirection: "row", gap: 6 },
  progressDash: {
    height: 3,
    width: 24,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  progressDashActive: {
    backgroundColor: theme.colors.accent,
  },
  skipText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textMuted,
    textDecorationLine: "underline",
  },
  body: { flex: 1, justifyContent: "center", paddingVertical: 24 },
});
