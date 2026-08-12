import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { flowIntensitySchema } from "@embr/validation";
import type { CycleEntryDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { categoryLabel } from "../../lib/format";
import { Chip } from "../../components/chip";

const FLOWS = flowIntensitySchema.options;

function todayIsoDate(): string {
  // Date-only, matching what the backend's upsert identity (one entry
  // per user per calendar day) actually keys on — a full ISO timestamp
  // here would carry a time-of-day and timezone that date-only storage
  // doesn't want or need.
  return new Date().toISOString().slice(0, 10);
}

export default function CycleScreen() {
  const [entries, setEntries] = useState<CycleEntryDto[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const [flow, setFlow] = useState<(typeof FLOWS)[number] | null>(null);
  const [periodStart, setPeriodStart] = useState(false);
  const [periodEnd, setPeriodEnd] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const page = await api.cycleEntries.list({ pageSize: 20 });
      setEntries(page.items);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      await api.cycleEntries.upsert({
        date: todayIsoDate(),
        flow: flow ?? undefined,
        isPeriodStart: periodStart,
        isPeriodEnd: periodEnd,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
      await loadEntries();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  }

  function markDirty() {
    setSaved(false);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Today&apos;s cycle entry</Text>

            <Text style={styles.sectionLabel}>Flow</Text>
            <View style={styles.chipRow}>
              <Chip
                label="None"
                selected={flow === null}
                onPress={() => {
                  setFlow(null);
                  markDirty();
                }}
              />
              {FLOWS.map((f) => (
                <Chip
                  key={f}
                  label={categoryLabel(f)}
                  selected={flow === f}
                  onPress={() => {
                    setFlow(f);
                    markDirty();
                  }}
                />
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Period started today</Text>
              <Switch
                value={periodStart}
                onValueChange={(v) => {
                  setPeriodStart(v);
                  markDirty();
                }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Period ended today</Text>
              <Switch
                value={periodEnd}
                onValueChange={(v) => {
                  setPeriodEnd(v);
                  markDirty();
                }}
              />
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Notes (optional)"
              value={notes}
              onChangeText={(v) => {
                setNotes(v);
                markDirty();
              }}
              multiline
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.buttonText}>
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save today's entry"}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Recent entries</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.entryRow}>
            <Text style={styles.entryDate}>{item.date}</Text>
            <Text style={styles.entryMeta}>
              {item.flow ? categoryLabel(item.flow) : "No flow logged"}
              {item.isPeriodStart ? " · Period start" : ""}
              {item.isPeriodEnd ? " · Period end" : ""}
            </Text>
            {item.notes && <Text style={styles.entryNotes}>{item.notes}</Text>}
          </View>
        )}
        ListEmptyComponent={
          !loadingEntries ? <Text style={styles.emptyText}>No entries yet.</Text> : null
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
  title: { fontSize: 22, fontWeight: "600", marginBottom: 8 },
  sectionLabel: { fontSize: 14, fontWeight: "500", color: "#374151", marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  switchLabel: { fontSize: 15, color: "#111827" },
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
  entryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  entryDate: { fontSize: 15, fontWeight: "500" },
  entryMeta: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  entryNotes: { fontSize: 13, color: "#4B5563", marginTop: 4 },
  emptyText: { fontSize: 14, color: "#9CA3AF", paddingVertical: 12 },
});
