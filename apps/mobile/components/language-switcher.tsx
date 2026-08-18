import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { LOCALES, setStoredLocale, type Locale } from "../lib/i18n/locale";
import { theme } from "../lib/theme";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [switching, setSwitching] = useState(false);

  async function handleChange(locale: Locale) {
    if (locale === i18n.language || switching) return;
    setSwitching(true);
    try {
      await setStoredLocale(locale);
      await i18n.changeLanguage(locale);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      <Text style={styles.label}>{t("languageSwitcher.label")}</Text>
      {LOCALES.map((locale) => {
        const active = i18n.language === locale;
        return (
          <Pressable
            key={locale}
            onPress={() => void handleChange(locale)}
            disabled={switching}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: switching }}
          >
            <Text style={[styles.option, active && styles.optionActive]}>
              {t(`languageSwitcher.${locale}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  label: { fontSize: 11, color: theme.colors.textMuted, alignSelf: "center" },
  option: { fontSize: 12, color: theme.colors.textMuted },
  optionActive: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
