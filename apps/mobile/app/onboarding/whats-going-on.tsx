import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { STEP_ROUTES } from "../../lib/onboarding-steps";
import { ONBOARDING_AREA_LABELS } from "../../lib/onboarding-areas";

const AREAS = Object.keys(ONBOARDING_AREA_LABELS) as (keyof typeof ONBOARDING_AREA_LABELS)[];
const AREA_KEYS: Record<string, string> = {
  SLEEP: "sleep",
  ENERGY: "energy",
  MOOD: "mood",
  BODY: "body",
  FOCUS: "focus",
  CYCLE: "cycle",
  OTHER: "somethingElse",
};
// A few concrete, recognizable examples per area, shown as quiet
// supporting text under the toggle — not a second layer of selectable
// options. Ported from apps/web/src/app/onboarding/whats-going-on/page.tsx
// alongside the same row layout, so the two platforms offer identical
// choices with identical example text.
const EXAMPLE_KEYS: Record<string, string> = {
  SLEEP: "sleepExamples",
  ENERGY: "energyExamples",
  MOOD: "moodExamples",
  BODY: "bodyExamples",
  FOCUS: "focusExamples",
  CYCLE: "cycleExamples",
  OTHER: "somethingElseExamples",
};

export default function WhatsGoingOnScreen() {
  const { t } = useTranslation();
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
      <Text style={styles.headline}>{t("onboarding.whatsGoingOn.headline")}</Text>
      <Text style={styles.hint}>{t("onboarding.whatsGoingOn.hint")}</Text>
      <View style={styles.rows}>
        {AREAS.map((value) => {
          const isSelected = selected.includes(value);
          return (
            <Pressable
              key={value}
              onPress={() => toggle(value)}
              style={[styles.row, isSelected && styles.rowSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                {t(`onboarding.whatsGoingOn.${AREA_KEYS[value]}`)}
              </Text>
              <Text style={styles.rowExamples}>
                {t(`onboarding.whatsGoingOn.${EXAMPLE_KEYS[value]}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => void handleContinue()}
        disabled={saving}
        style={[styles.button, saving && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>
          {saving ? "…" : t("onboarding.whatsGoingOn.continue")}
        </Text>
      </Pressable>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: "500", color: theme.colors.textPrimary },
  hint: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  rows: { marginTop: 28, gap: 8 },
  row: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  rowLabel: { fontSize: 14, fontWeight: "500", color: theme.colors.textPrimary },
  rowLabelSelected: { color: theme.colors.accent },
  rowExamples: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted },
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
