import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import type { SymptomCoOccurrenceDto } from "@embr/types";
import { api } from "../lib/api";
import { LoadingState } from "./loading-state";
import { theme } from "../lib/theme";

export function CoOccurrenceCard({ from, to }: { from?: string; to?: string }) {
  const { t } = useTranslation();

  const [result, setResult] = useState<SymptomCoOccurrenceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Matches React's own documented fetch-on-mount pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data); same
    // suppression convention as lib/auth-context.tsx and the
    // equivalent case in apps/web/src/components/co-occurrence-card.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrored(false);

    api.trends
      .coOccurrence({ from, to })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        // Fails quietly, not with an error message — this is a
        // supplementary insight, not core functionality; the rest of
        // the screen works either way. A real failure just means the
        // card doesn't render, same as "nothing qualifies."
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  if (loading) return <LoadingState compact />;

  // Errored, or nothing qualified — both render nothing, matching
  // AppointmentCard's exact "no real signal, no card" convention.
  if (errored || !result) return null;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={t("coOccurrence.heading")}
    >
      <Ionicons name="link-outline" size={20} color={theme.colors.accent} />
      <Text style={styles.heading}>{t("coOccurrence.heading")}</Text>
      <Text style={styles.message}>
        {t("coOccurrence.message", {
          categoryA: t(`enums.category.${result.categoryA}`),
          categoryB: t(`enums.category.${result.categoryB}`),
          count: result.days,
        })}
      </Text>
      <Text style={styles.caveat}>{t("coOccurrence.caveat")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  heading: { fontSize: 14, fontWeight: "600", color: theme.colors.textPrimary },
  message: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 18 },
  caveat: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 },
});
