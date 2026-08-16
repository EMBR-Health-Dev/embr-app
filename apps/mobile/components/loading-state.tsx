import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";

export function LoadingState({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <View style={[styles.container, compact && styles.compact]}>
      <ActivityIndicator color={theme.colors.accent} />
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 10 },
  compact: { paddingVertical: 16 },
  label: { fontSize: 13, color: theme.colors.textMuted },
});
