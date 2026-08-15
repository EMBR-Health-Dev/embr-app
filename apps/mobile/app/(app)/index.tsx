import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { severityLevelSchema, symptomCategorySchema } from "@embr/validation";
import type { OnboardingProfileDto, SymptomLogDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Chip } from "../../components/chip";
import { theme } from "../../lib/theme";
import { startingPointMessage } from "../../lib/onboarding-starting-point";

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

  const loadLogs = useCallback(async () => {
    try {
      const page = await api.symptomLogs.list({ pageSize: 20 });
      setLogs(page.items);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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
      await loadLogs();
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

            {startingPointMessage(onboardingProfile?.jobToBeDone ?? null) && (
              <Text style={styles.startingPoint}>
                {startingPointMessage(onboardingProfile?.jobToBeDone ?? null)}
              </Text>
            )}

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
          !loadingLogs ? <Text style={styles.emptyText}>{t("home.noSymptomsYet")}</Text> : null
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 8 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "600" },
  logoutText: { fontSize: 14, color: "#6B7280" },
  startingPoint: {
    fontSize: 15,
    fontStyle: "italic",
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  sectionLabel: { fontSize: 14, fontWeight: "500", color: "#374151", marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notesInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
    marginTop: 8,
  },
  error: { color: "#DC2626", fontSize: 14 },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  logCategory: { fontSize: 15, fontWeight: "500" },
  logMeta: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  logNotes: { fontSize: 13, color: "#4B5563", marginTop: 4 },
  deleteText: { fontSize: 13, color: "#DC2626" },
  emptyText: { fontSize: 14, color: "#9CA3AF", paddingVertical: 12 },
});
