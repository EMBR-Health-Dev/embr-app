import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ReflectionDto } from "@embr/types";
import { theme } from "../lib/theme";

export function ReflectionCard({
  reflection,
  onDismiss,
}: {
  reflection: ReflectionDto;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();

  const message =
    reflection.type === "weekly_frequency"
      ? `${t("home.thisWeek", { count: reflection.totalCount })} · ${t("home.mostCommon", { category: t(`enums.category.${reflection.topCategory}`) })}`
      : t("home.loggingStreak", { count: reflection.days });

  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={() => onDismiss(reflection.id)}
        accessibilityRole="button"
        accessibilityLabel={t("home.dismissReflection")}
        hitSlop={8}
      >
        <Text style={styles.dismiss}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: theme.colors.successSoft,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.success,
  },
  dismiss: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
});
