import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { Chip } from "../../components/chip";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";
import { ONBOARDING_AREA_LABELS } from "../../lib/onboarding-areas";

const AREAS = Object.keys(ONBOARDING_AREA_LABELS);

export default function WhatsGoingOnScreen() {
  const { profile, patch } = useOnboarding();
  // Lazy initializer covers profile already being populated at this
  // component's very first render (e.g. the person went forward then
  // came back — OnboardingProvider stays mounted across that
  // navigation, so profile isn't still null). Same fix as
  // apps/web/src/app/onboarding/whats-going-on/page.tsx, ported after
  // finding the same bug there first.
  const [selected, setSelected] = useState<string[]>(() => profile?.noticedAreas ?? []);
  const [saving, setSaving] = useState(false);

  // React's documented pattern for "adjust local editable state once
  // an async value arrives" — covers the other case the lazy
  // initializer above doesn't: profile still null at mount, populated
  // afterward once OnboardingProvider's fetch resolves.
  const [syncedProfile, setSyncedProfile] = useState(profile);
  if (profile !== syncedProfile) {
    setSyncedProfile(profile);
    if (profile) setSelected(profile.noticedAreas);
  }

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await patch({ noticedAreas: selected, currentStep: "APPOINTMENT_STATUS" });
      router.push(STEP_ROUTES.APPOINTMENT_STATUS);
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingScreen step="WHATS_GOING_ON">
      <Text style={styles.headline}>What have you noticed lately?</Text>
      <Text style={styles.hint}>
        Pick anything that&apos;s felt different. This isn&apos;t a log yet. It just helps your
        first check-in feel like it already knows you.
      </Text>
      <View style={styles.chips}>
        {AREAS.map((value) => (
          <Chip
            key={value}
            label={ONBOARDING_AREA_LABELS[value]}
            selected={selected.includes(value)}
            onPress={() => toggle(value)}
          />
        ))}
      </View>
      <Pressable
        onPress={() => void handleContinue()}
        disabled={saving}
        style={[styles.button, saving && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{saving ? "…" : "Continue"}</Text>
      </Pressable>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: "500", color: theme.colors.textPrimary },
  hint: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  chips: { marginTop: 28, flexDirection: "row", flexWrap: "wrap", gap: 10 },
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
