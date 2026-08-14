import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { ONBOARDING_AREA_LABELS, firstSuggestedCategory } from "../../lib/onboarding-areas";

export default function TheLoopScreen() {
  const { profile, patch } = useOnboarding();
  const [finishing, setFinishing] = useState(false);

  const noticedAreas = profile?.noticedAreas ?? [];
  const trackLabel =
    noticedAreas.length > 0
      ? noticedAreas.map((a) => ONBOARDING_AREA_LABELS[a] ?? a).join(" · ")
      : "Sleep · Energy · Mood";

  async function finishAndGo(params?: Record<string, string>) {
    setFinishing(true);
    try {
      await patch({ status: "completed" });
      router.replace({ pathname: "/(app)", params });
    } finally {
      setFinishing(false);
    }
  }

  function handleLogFirstEntry() {
    const suggested = firstSuggestedCategory(noticedAreas);
    void finishAndGo(suggested ? { logCategory: suggested } : { firstLog: "1" });
  }

  return (
    <OnboardingScreen step="THE_LOOP">
      <Text style={styles.headline}>Here&apos;s how EMBR works.</Text>

      <View style={styles.timeline}>
        <View style={styles.connectingLine} />

        <LoopStage label="Track" title={trackLabel} />
        <LoopStage
          label="Patterns"
          title="Once you've logged for a couple of weeks, you might see something like:"
        >
          <Text style={styles.exampleQuote}>
            &quot;Your sleep disruption appeared alongside lower energy on 6 days.&quot;
          </Text>
          <Text style={styles.caveat}>
            Descriptive, not diagnostic. EMBR never tells you what&apos;s causing something.
          </Text>
        </LoopStage>
        <LoopStage label="Brief" title="Evidence · Patterns · Questions">
          <Text style={styles.stageBody}>
            A structured summary of your record, built when you&apos;re ready. Not automatically.
          </Text>
        </LoopStage>
        <LoopStage
          label="Healthcare conversation"
          title="Something concrete to bring into your next appointment."
          last
        >
          <Text style={styles.stageBody}>Entirely optional, and entirely yours.</Text>
        </LoopStage>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleLogFirstEntry}
          disabled={finishing}
          style={[styles.button, finishing && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{finishing ? "…" : "Log your first entry"}</Text>
        </Pressable>
        <Pressable onPress={() => void finishAndGo()} disabled={finishing}>
          <Text style={styles.secondaryLink}>Go to dashboard instead</Text>
        </Pressable>
      </View>
    </OnboardingScreen>
  );
}

function LoopStage({
  label,
  title,
  children,
  last,
}: {
  label: string;
  title: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const stageStyle: ViewStyle = last
    ? { ...styles.stage, paddingBottom: 0 }
    : { ...styles.stage, paddingBottom: 28 };
  return (
    <View style={stageStyle}>
      <View style={styles.stageMarker} />
      <Text style={styles.stageLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.stageTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: "500", color: theme.colors.textPrimary },
  timeline: { marginTop: 28 },
  connectingLine: {
    position: "absolute",
    left: 5,
    top: 14,
    bottom: 14,
    width: 1,
    backgroundColor: theme.colors.border,
  },
  stage: { paddingLeft: 26, position: "relative" },
  stageMarker: {
    position: "absolute",
    left: 0,
    top: 4,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.background,
  },
  stageLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: theme.colors.accent,
  },
  stageTitle: { marginTop: 4, fontSize: 15, color: theme.colors.textPrimary },
  exampleQuote: {
    marginTop: 8,
    fontSize: 15,
    fontStyle: "italic",
    color: theme.colors.textPrimary,
  },
  caveat: { marginTop: 8, fontSize: 12, color: theme.colors.textMuted },
  stageBody: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  actions: { marginTop: 32, gap: 12 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 15, fontWeight: "600" },
  secondaryLink: {
    textAlign: "center",
    fontSize: 14,
    color: theme.colors.textSecondary,
    textDecorationLine: "underline",
  },
});
