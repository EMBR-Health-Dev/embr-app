import { useEffect } from "react";
import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { STEP_ROUTES, isOnboardingStep } from "../../lib/onboarding-steps";
import { theme } from "../../lib/theme";

export default function OnboardingIndex() {
  const { profile, loading } = useOnboarding();

  useEffect(() => {
    if (loading) return;
    const currentStep = profile?.currentStep ?? null;
    const step = isOnboardingStep(currentStep) ? currentStep : "WELCOME";
    router.replace(STEP_ROUTES[step]);
  }, [loading, profile]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator color={theme.colors.textPrimary} />
    </View>
  );
}
