import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { severityLevelSchema, symptomCategorySchema } from "@embr/validation";
import type { SymptomLogDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { categoryLabel, severityLabel } from "../../lib/format";
import { Chip } from "../../components/chip";

const CATEGORIES = symptomCategorySchema.options;
const SEVERITIES = severityLevelSchema.options;

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
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

  async function handleLogSymptom() {
    setFormError(null);
    if (!category || !severity) {
      setFormError("Pick a category and severity first.");
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
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
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
              <Text style={styles.title}>Hi{user ? `, ${user.email.split("@")[0]}` : ""}</Text>
              <Pressable onPress={handleLogout}>
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>How are you feeling right now?</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={categoryLabel(c)}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>Severity</Text>
            <View style={styles.chipRow}>
              {SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  label={severityLabel(s)}
                  selected={severity === s}
                  onPress={() => setSeverity(s)}
                />
              ))}
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Notes (optional)"
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
              <Text style={styles.buttonText}>{submitting ? "Logging…" : "Log symptom"}</Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Recent logs</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logCategory}>{categoryLabel(item.category)}</Text>
              <Text style={styles.logMeta}>
                {severityLabel(item.severity)} · {new Date(item.occurredAt).toLocaleString()}
              </Text>
              {item.notes && <Text style={styles.logNotes}>{item.notes}</Text>}
            </View>
            <Pressable onPress={() => void handleDelete(item.id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !loadingLogs ? <Text style={styles.emptyText}>No symptoms logged yet.</Text> : null
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
