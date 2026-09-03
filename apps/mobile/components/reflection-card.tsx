import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import type { ReflectionDto } from "@embr/types";
import { theme } from "../lib/theme";

/**
 * ReflectionDto is deliberately just structured facts (see its doc
 * comment in @embr/types) — this is the one place in the app that
 * turns those facts into the exact sentence a user sees, per type.
 * Every message here describes what was logged, never what it means —
 * see reflection-engine.ts's TREATMENT_CONTEXT doc comment for the
 * specific claim ("your treatment is helping") this must never make.
 */
function reflectionCopy(
  reflection: ReflectionDto,
  t: (key: string, options?: Record<string, unknown>) => string,
): { heading: string; message: string; caveat?: string } {
  switch (reflection.type) {
    case "LOGGING_ACTIVITY":
      return {
        heading: t("reflections.loggingActivity.heading"),
        message: t("reflections.loggingActivity.message", {
          count: reflection.logCount,
          days: reflection.daysLogged,
        }),
      };
    case "SYMPTOM_FREQUENCY":
      return {
        heading: t("reflections.symptomFrequency.heading"),
        message: t("reflections.symptomFrequency.message", {
          category: t(`enums.category.${reflection.category}`),
          count: reflection.count,
        }),
      };
    case "SYMPTOM_CO_OCCURRENCE":
      return {
        heading: t("reflections.coOccurrence.heading"),
        message: t("reflections.coOccurrence.message", {
          categoryA: t(`enums.category.${reflection.categoryA}`),
          categoryB: t(`enums.category.${reflection.categoryB}`),
          count: reflection.days,
        }),
        caveat: t("reflections.coOccurrence.caveat"),
      };
    case "TREATMENT_CONTEXT":
      return {
        heading: t("reflections.treatmentContext.heading", { name: reflection.treatmentName }),
        message: t("reflections.treatmentContext.message", { count: reflection.logCount }),
        caveat: t("reflections.treatmentContext.caveat"),
      };
  }
}

export function ReflectionCard({
  reflection,
  onDismiss,
}: {
  reflection: ReflectionDto;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const copy = reflectionCopy(reflection, t);

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={copy.heading}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
        <Text style={styles.heading}>{copy.heading}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("reflections.dismiss")}
        >
          <Ionicons name="close" size={16} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.message}>{copy.message}</Text>
      {copy.caveat && <Text style={styles.caveat}>{copy.caveat}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heading: { fontSize: 14, fontWeight: "600", color: theme.colors.textPrimary, flex: 1 },
  message: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 18 },
  caveat: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 },
});
