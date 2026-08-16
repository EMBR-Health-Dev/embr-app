import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";

// Only WITHIN_MONTH and UNSURE_WHEN carry a real "yes, something is
// coming" signal from onboarding's appointmentStatus question — NO and
// UNSURE (the person doesn't currently have or expect one) have
// nothing here worth nudging toward, so this renders nothing for
// those, not an empty/awkward card.
const MESSAGE_KEYS: Record<string, string> = {
  WITHIN_MONTH: "appointmentCard.withinMonth",
  UNSURE_WHEN: "appointmentCard.unsureWhen",
};

export function AppointmentCard({ appointmentStatus }: { appointmentStatus: string | null }) {
  const { t } = useTranslation();

  if (!appointmentStatus || !MESSAGE_KEYS[appointmentStatus]) return null;

  return (
    <View style={styles.card}>
      <Ionicons name="calendar-outline" size={20} color={theme.colors.accent} />
      <Text style={styles.message}>{t(MESSAGE_KEYS[appointmentStatus])}</Text>
      <Pressable onPress={() => router.push("/(app)/brief")}>
        <Text style={styles.link}>{t("appointmentCard.generateBrief")}</Text>
      </Pressable>
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
    gap: 8,
  },
  message: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: "600", color: theme.colors.success },
});
