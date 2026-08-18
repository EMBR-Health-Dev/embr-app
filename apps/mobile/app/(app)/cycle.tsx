import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { flowIntensitySchema } from "@embr/validation";
import type { CycleEntryDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Chip } from "../../components/chip";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { theme } from "../../lib/theme";

const FLOWS = flowIntensitySchema.options;

function todayIsoDate(): string {
  // Date-only, matching what the backend's upsert identity (one entry
  // per user per calendar day) actually keys on — a full ISO timestamp
  // here would carry a time-of-day and timezone that date-only storage
  // doesn't want or need.
  return new Date().toISOString().slice(0, 10);
}

export default function CycleScreen() {
  const { t } = useTranslation();
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
      setFormError(err instanceof ApiError ? err.message : t("cycle.genericError"));
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
            <Text style={styles.title}>{t("cycle.title")}</Text>

            <Text style={styles.sectionLabel}>{t("cycle.flow")}</Text>
            <View style={styles.chipRow}>
              <Chip
                label={t("cycle.none")}
                selected={flow === null}
                onPress={() => {
                  setFlow(null);
                  markDirty();
                }}
              />
              {FLOWS.map((f) => (
                <Chip
                  key={f}
                  label={t(`enums.flow.${f}`)}
                  selected={flow === f}
                  onPress={() => {
                    setFlow(f);
                    markDirty();
                  }}
                />
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t("cycle.periodStartedToday")}</Text>
              <Switch
                value={periodStart}
                onValueChange={(v) => {
                  setPeriodStart(v);
                  markDirty();
                }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t("cycle.periodEndedToday")}</Text>
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
              placeholder={t("cycle.notesPlaceholder")}
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
                {saving ? t("cycle.saving") : saved ? t("cycle.saved") : t("cycle.saveTodaysEntry")}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>{t("cycle.recentEntries")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.entryRow}>
            <Text style={styles.entryDate}>{item.date}</Text>
            <Text style={styles.entryMeta}>
              {item.flow ? t(`enums.flow.${item.flow}`) : t("cycle.noFlowLogged")}
              {item.isPeriodStart ? t("cycle.periodStart") : ""}
              {item.isPeriodEnd ? t("cycle.periodEnd") : ""}
            </Text>
            {item.notes && <Text style={styles.entryNotes}>{item.notes}</Text>}
          </View>
        )}
        ListEmptyComponent={
          loadingEntries ? (
            <LoadingState />
          ) : (
            <EmptyState icon="calendar-outline" label={t("cycle.noEntriesYet")} />
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
  title: { fontSize: 22, fontWeight: "600", marginBottom: 8, color: theme.colors.textPrimary },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  switchLabel: { fontSize: 15, color: theme.colors.textPrimary },
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
  entryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  entryDate: { fontSize: 15, fontWeight: "500", color: theme.colors.textPrimary },
  entryMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  entryNotes: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
});
