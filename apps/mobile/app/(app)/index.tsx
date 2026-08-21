import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { severityLevelSchema, symptomCategorySchema } from "@embr/validation";
import type { OnboardingProfileDto, SymptomFrequencyDto, SymptomLogDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { AppointmentCard } from "../../components/appointment-card";
import { Chip } from "../../components/chip";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { theme } from "../../lib/theme";
import { startingPointMessageKey } from "../../lib/onboarding-starting-point";

const CATEGORIES = symptomCategorySchema.options;
const SEVERITIES = severityLevelSchema.options;

function isCategory(value: unknown): value is (typeof CATEGORIES)[number] {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const params = useLocalSearchParams<{ logCategory?: string; firstLog?: string }>();
  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfileDto | null>(null);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(
    isCategory(params.logCategory) ? params.logCategory : null,
  );
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number] | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [weeklyFrequency, setWeeklyFrequency] = useState<SymptomFrequencyDto[]>([]);

  const loadLogs = useCallback(async () => {
    try {
      const page = await api.symptomLogs.list({ pageSize: 20 });
      setLogs(page.items);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // The smallest possible ongoing reflection: how many logs this week
  // and the most common category, reusing the same server-side
  // aggregate the Trends tab already calls (Milestone 9) rather than
  // adding a new endpoint for a single summary line.
  const loadWeeklyFrequency = useCallback(async () => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    try {
      const frequency = await api.trends.symptomFrequency({ from: from.toISOString() });
      setWeeklyFrequency(frequency);
    } catch {
      setWeeklyFrequency([]);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
    void loadWeeklyFrequency();
  }, [loadLogs, loadWeeklyFrequency]);

  // Soft, not a block: /onboarding's skip link reaches this same
  // screen in one tap from any onboarding screen, and completing/
  // skipping sets onboardingCompletedAt either way, so this redirect
  // only ever fires once per person, not on every visit. Mirrors
  // apps/web/src/app/dashboard/page.tsx's identical redirect.
  useEffect(() => {
    if (user && !user.onboardingCompletedAt) router.replace("/onboarding");
  }, [user]);

  useEffect(() => {
    // Only reachable once onboardingCompletedAt is set (the redirect
    // above sends anyone else to /onboarding first), so there's
    // always a real profile to fetch by the time this runs. Mirrors
    // apps/web/src/app/dashboard/page.tsx's identical fetch.
    if (user?.onboardingCompletedAt) {
      api.onboarding
        .get()
        .then(setOnboardingProfile)
        .catch(() => setOnboardingProfile(null));
    }
  }, [user]);

  async function handleLogSymptom() {
    setFormError(null);
    setConfirmation(null);
    if (!category || !severity) {
      setFormError(t("home.pickCategoryAndSeverity"));
      return;
    }

    setSubmitting(true);
    try {
      await api.symptomLogs.create({
        category,
        severity,
        occurredAt: new Date().toISOString(),
        notes: notes.trim() || undefined,
      });
      setCategory(null);
      setSeverity(null);
      setNotes("");
      setConfirmation(t("home.logConfirmation"));
      await Promise.all([loadLogs(), loadWeeklyFrequency()]);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("home.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    try {
      await api.symptomLogs.delete(id);
    } catch {
      // Put it back — the optimistic removal above didn't actually
      // stick server-side, so the list shouldn't silently drift from
      // what's really there.
      await loadLogs();
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const startingPointKey = startingPointMessageKey(onboardingProfile?.jobToBeDone ?? null);

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                {user
                  ? t("home.greetingWithName", { name: user.email.split("@")[0] })
                  : t("home.greeting")}
              </Text>
              <Pressable onPress={handleLogout}>
                <Text style={styles.logoutText}>{t("home.logout")}</Text>
              </Pressable>
            </View>

            {startingPointKey && <Text style={styles.startingPoint}>{t(startingPointKey)}</Text>}

            {weeklyFrequency.length > 0 && (
              <Text style={styles.reflection}>
                {t("home.thisWeek", {
                  count: weeklyFrequency.reduce((sum, f) => sum + f.count, 0),
                })}
                {" · "}
                {t("home.mostCommon", { category: t(`enums.category.${weeklyFrequency[0].category}`) })}
              </Text>
            )}

            <AppointmentCard appointmentStatus={onboardingProfile?.appointmentStatus ?? null} />

            <Text style={styles.sectionLabel}>{t("home.howAreYouFeeling")}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={t(`enums.category.${c}`)}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("home.severity")}</Text>
            <View style={styles.chipRow}>
              {SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  label={t(`enums.severity.${s}`)}
                  selected={severity === s}
                  onPress={() => setSeverity(s)}
                />
              ))}
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder={t("home.notesPlaceholder")}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleLogSymptom}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? t("home.logging") : t("home.logSymptom")}
              </Text>
            </Pressable>

            {confirmation && <Text style={styles.confirmation}>{confirmation}</Text>}

            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>{t("home.recentLogs")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logCategory}>{t(`enums.category.${item.category}`)}</Text>
              <Text style={styles.logMeta}>
                {t(`enums.severity.${item.severity}`)} ·{" "}
                {new Date(item.occurredAt).toLocaleString()}
              </Text>
              {item.notes && <Text style={styles.logNotes}>{item.notes}</Text>}
            </View>
            <Pressable onPress={() => void handleDelete(item.id)}>
              <Text style={styles.deleteText}>{t("home.delete")}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loadingLogs ? (
            <LoadingState />
          ) : (
            <EmptyState icon="pulse-outline" label={t("home.noSymptomsYet")} />
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 8 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "600", color: theme.colors.textPrimary },
  logoutText: { fontSize: 14, color: theme.colors.textMuted },
  startingPoint: {
    fontSize: 15,
    fontStyle: "italic",
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  reflection: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.success,
    marginBottom: 4,
  },
  confirmation: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.success,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notesInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
    marginTop: 8,
    color: theme.colors.textPrimary,
  },
  error: { color: theme.colors.error, fontSize: 14 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 16, fontWeight: "600" },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logCategory: { fontSize: 15, fontWeight: "500", color: theme.colors.textPrimary },
  logMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  logNotes: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  deleteText: { fontSize: 13, color: theme.colors.error },
});
