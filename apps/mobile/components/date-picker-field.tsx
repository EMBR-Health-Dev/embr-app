import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import { theme } from "../lib/theme";

// Android's native date dialog is its own modal that opens and closes
// itself — the picker only needs to be mounted while it's showing.
// iOS's inline/default picker has no such self-dismissing behavior, so
// it stays visible until the person taps Done — hence the explicit
// button below, shown only on iOS.
export function DatePickerField({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const { t } = useTranslation();
  const [showing, setShowing] = useState(false);

  function handleValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    if (Platform.OS === "android") setShowing(false);
    onChange(date);
  }

  return (
    <View style={styles.field}>
      <Pressable onPress={() => setShowing(true)} style={styles.trigger} accessibilityRole="button">
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? value.toLocaleDateString() : label}
        </Text>
      </Pressable>

      {showing && (
        <>
          <DateTimePicker
            value={value ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onValueChange={handleValueChange}
            onDismiss={() => setShowing(false)}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
          />
          {Platform.OS === "ios" && (
            <Pressable onPress={() => setShowing(false)} style={styles.doneButton}>
              <Text style={styles.doneText}>{t("common.done")}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1 },
  trigger: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  valueText: { fontSize: 15, color: theme.colors.textPrimary },
  placeholderText: { fontSize: 15, color: theme.colors.textMuted },
  doneButton: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
  doneText: { fontSize: 15, fontWeight: "600", color: theme.colors.success },
});
