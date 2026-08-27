import { useState } from "react";
import { router, Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { symptomCategorySchema } from "@embr/validation";
import type { PerimenopauseAssessmentResultDto } from "@embr/types";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { Chip } from "../components/chip";
import { theme } from "../lib/theme";

const CATEGORIES = symptomCategorySchema.options;

export default function AssessmentScreen() {
  const { t } = useTranslation();

  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [hasIrregularPeriods, setHasIrregularPeriods] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PerimenopauseAssessmentResultDto | null>(null);

  function toggleSymptom(category: string) {
    setSymptoms((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      const data = await api.publicAssessment.submit({ symptoms, hasIrregularPeriods });
      setResult(data);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("assessment.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const tierKey = result.tier === "high" ? "highTier" : "lowTier";
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>{t(`assessment.${tierKey}Title`)}</Text>
          <Text style={styles.body}>{t(`assessment.${tierKey}Body`)}</Text>
          <Text style={styles.disclaimer}>{t("assessment.disclaimer")}</Text>

          <Pressable style={styles.button} onPress={() => router.push("/register")}>
            <Text style={styles.buttonText}>{t("assessment.createAccount")}</Text>
          </Pressable>
          <Link href="/login" style={styles.link}>
            <Text style={styles.linkText}>{t("assessment.alreadyHaveAccount")}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t("assessment.title")}</Text>
        <Text style={styles.subtitle}>{t("assessment.subtitle")}</Text>

        <Text style={styles.sectionLabel}>{t("assessment.symptomsLabel")}</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={t(`enums.category.${category}`)}
              selected={symptoms.includes(category)}
              onPress={() => toggleSymptom(category)}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t("assessment.irregularPeriodsLabel")}</Text>
        <View style={styles.chipRow}>
          <Chip
            label={t("assessment.irregularPeriodsLabel")}
            selected={hasIrregularPeriods}
            onPress={() => setHasIrregularPeriods((prev) => !prev)}
          />
        </View>

        {formError && <Text style={styles.error}>{formError}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? t("assessment.submitting") : t("assessment.submit")}
          </Text>
        </Pressable>

        <Text style={styles.disclaimer}>{t("assessment.disclaimer")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: "600", color: theme.colors.textPrimary },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  body: { fontSize: 16, color: theme.colors.textSecondary, lineHeight: 22, marginTop: 4 },
  sectionLabel: { marginTop: 12, fontSize: 14, fontWeight: "500", color: theme.colors.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  error: { color: theme.colors.error, fontSize: 14 },
  disclaimer: { marginTop: 16, fontSize: 12, color: theme.colors.textSecondary },
  button: {
    marginTop: 16,
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 16, fontWeight: "600" },
  link: { marginTop: 12, alignSelf: "center" },
  linkText: { color: theme.colors.success, fontWeight: "500" },
});
