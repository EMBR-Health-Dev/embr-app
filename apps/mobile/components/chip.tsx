import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";

/**
 * A selectable option. Selected is shown by a check mark, weight and
 * border as well as tone, so it never depends on colour alone. With
 * `intensity` (1 to 3, for Mild / Moderate / Severe) it also shows three
 * rising bars filled up to that level: intensity by shape and position,
 * readable in greyscale, never a red "danger" signal.
 */
export function Chip({
  label,
  selected,
  onPress,
  intensity,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  intensity?: 1 | 2 | 3;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {selected && (
        <Text style={styles.check} accessible={false}>
          ✓
        </Text>
      )}
      {intensity !== undefined && (
        <View style={styles.bars} accessible={false}>
          {[1, 2, 3].map((step) => (
            <View
              key={step}
              style={[styles.bar, { height: 4 + step * 3 }, step > intensity && styles.barEmpty]}
            />
          ))}
        </View>
      )}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 14,
  },
  chipSelected: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.selected,
  },
  check: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: theme.colors.textPrimary,
  },
  barEmpty: {
    opacity: 0.2,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  labelSelected: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
});
