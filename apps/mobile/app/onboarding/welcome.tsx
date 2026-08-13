import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";

export default function WelcomeScreen() {
  const { patch } = useOnboarding();
  const [starting, setStarting] = useState(false);

  async function handleContinue() {
    setStarting(true);
    try {
      await patch({ currentStep: "JOB_TO_BE_DONE" });
      router.push(STEP_ROUTES.JOB_TO_BE_DONE);
    } finally {
      setStarting(false);
    }
  }

  return (
    <OnboardingScreen step="WELCOME">
      <Text style={styles.headline}>
        A place to keep track of what&apos;s actually happening to you.
      </Text>
      <Text style={styles.body}>
        EMBR helps you turn what you&apos;re experiencing into something you can look back on,
        understand, and eventually bring into a conversation with your doctor. It doesn&apos;t
        diagnose you or replace your clinician. It helps you organize your own record, on your own
        terms.
      </Text>
      <Pressable
        onPress={() => void handleContinue()}
        disabled={starting}
        style={[styles.button, starting && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{starting ? "…" : "Get started"}</Text>
      </Pressable>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  body: {
    marginTop: 20,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textSecondary,
  },
  button: {
    marginTop: 32,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 14, fontWeight: "600" },
});
