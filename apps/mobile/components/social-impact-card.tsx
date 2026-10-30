import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { socialImpactSchema } from "@embr/validation";
import type { ContextLogDto, SocialImpact } from "@embr/types";
import { api } from "../lib/api";
import { ApiError } from "../lib/api-client";
import { toIsoDate } from "../lib/date-format";
import { errorMarker, theme } from "../lib/theme";
import { Chip } from "./chip";

const ANSWERS = socialImpactSchema.options;

/**
 * "Did symptoms affect time with family or friends today?" Mirrors the
 * web dashboard's question and WorkImpactCard. Counted only in the
 * person's own BRIEF: never sent to the AI and never part of any
 * organisation statistic.
 *
 * The context upsert replaces most factors for the day, so today's entry
 * is loaded first and its other factors (possibly logged on the web) are
 * sent back unchanged; only this answer is edited here. Not logged is a
 * real choice and is sent as null, which clears it.
 */
export function SocialImpactCard() {
  const { t } = useTranslation();
  const [today] = useState(() => toIsoDate(new Date()));
  const [existing, setExisting] = useState<ContextLogDto | null>(null);
  const [answer, setAnswer] = useState<SocialImpact | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.contextLogs
      .list({ from: today, to: today, pageSize: 1 })
      .then((page) => {
        if (cancelled) return;
        const entry = page.items[0] ?? null;
        setExisting(entry);
        setAnswer(entry?.socialImpact ?? null);
      })
      .catch(() => {
        // Without today's entry the other factors can't be preserved,
        // so saving stays off rather than risking erasing them.
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [today, t]);

  function choose(value: SocialImpact | null) {
    setAnswer(value);
    setSaved(false);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const entry = await api.contextLogs.upsert({
        date: today,
        sleepDuration: existing?.sleepDuration ?? undefined,
        caffeineAfternoon: existing?.caffeineAfternoon ?? undefined,
        alcohol: existing?.alcohol ?? undefined,
        stressLevel: existing?.stressLevel ?? undefined,
        nightSweats: existing?.nightSweats ?? undefined,
        workImpact: existing?.workImpact ?? undefined,
        socialImpact: answer,
      });
      setExisting(entry);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("socialImpact.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const canSave = loaded && !loadFailed && !saving;

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{t("socialImpact.question")}</Text>
      <View style={styles.chipRow}>
        <Chip
          label={t("socialImpact.notLogged")}
          selected={answer === null}
          onPress={() => choose(null)}
        />
        {ANSWERS.map((a) => (
          <Chip
            key={a}
            label={t(`enums.socialImpact.${a}`)}
            selected={answer === a}
            onPress={() => choose(a)}
          />
        ))}
      </View>
      <Text style={styles.help}>{t("socialImpact.help")}</Text>
      {loadFailed && <Text style={styles.error}>{t("socialImpact.loadError")}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, !canSave && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {saving
            ? t("socialImpact.saving")
            : saved
              ? t("socialImpact.saved")
              : t("socialImpact.save")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 16,
    gap: 10,
    marginTop: 8,
  },
  question: { fontSize: 15, fontWeight: "600", color: theme.colors.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  help: { fontSize: 12, color: theme.colors.textMuted },
  error: { ...errorMarker, fontSize: 14 },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.primaryForeground, fontSize: 15, fontWeight: "600" },
});
