import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../lib/onboarding-context";
import { OnboardingScreen } from "../../components/onboarding-screen";
import { theme } from "../../lib/theme";
import { ONBOARDING_AREA_LABELS, firstSuggestedCategory } from "../../lib/onboarding-areas";

const AREA_KEYS: Record<string, string> = {
  SLEEP: "onboarding.whatsGoingOn.sleep",
  ENERGY: "onboarding.whatsGoingOn.energy",
  MOOD: "onboarding.whatsGoingOn.mood",
  BODY: "onboarding.whatsGoingOn.body",
  FOCUS: "onboarding.whatsGoingOn.focus",
};

export default function TheLoopScreen() {
  const { t } = useTranslation();
  const { profile, patch } = useOnboarding();
  const [finishing, setFinishing] = useState(false);

  const noticedAreas = profile?.noticedAreas ?? [];
  const trackLabel =
    noticedAreas.length > 0
      ? noticedAreas
          .map((a) => (AREA_KEYS[a] ? t(AREA_KEYS[a]) : (ONBOARDING_AREA_LABELS[a] ?? a)))
          .join(" · ")
      : t("onboarding.theLoop.trackFallback");

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
      <Text style={styles.headline}>{t("onboarding.theLoop.headline")}</Text>

      <View style={styles.timeline}>
        <View style={styles.connectingLine} />

        <LoopStage label={t("onboarding.theLoop.trackLabel")} title={trackLabel}>
          <Text style={styles.caveat}>{t("onboarding.theLoop.trackTreatmentsHint")}</Text>
        </LoopStage>
        <LoopStage
          label={t("onboarding.theLoop.patternsLabel")}
          title={t("onboarding.theLoop.patternsTitle")}
        >
          <Text style={styles.exampleQuote}>{t("onboarding.theLoop.patternsExample")}</Text>
          <Text style={styles.caveat}>{t("onboarding.theLoop.patternsCaveat")}</Text>
        </LoopStage>
        <LoopStage
          label={t("onboarding.theLoop.briefLabel")}
          title={t("onboarding.theLoop.briefTitle")}
        >
          <Text style={styles.stageBody}>{t("onboarding.theLoop.briefBody")}</Text>
        </LoopStage>
        <LoopStage
          label={t("onboarding.theLoop.conversationLabel")}
          title={t("onboarding.theLoop.conversationTitle")}
          last
        >
          <Text style={styles.stageBody}>{t("onboarding.theLoop.conversationBody")}</Text>
        </LoopStage>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleLogFirstEntry}
          disabled={finishing}
          style={[styles.button, finishing && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {finishing ? "…" : t("onboarding.theLoop.logFirstEntry")}
          </Text>
        </Pressable>
        <Pressable onPress={() => void finishAndGo()} disabled={finishing}>
          <Text style={styles.secondaryLink}>{t("onboarding.theLoop.goToDashboard")}</Text>
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
