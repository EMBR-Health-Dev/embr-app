import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { treatmentCategorySchema } from "@embr/validation";
import type { TreatmentDto, TreatmentImpactDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { Chip } from "../../components/chip";
import { DatePickerField } from "../../components/date-picker-field";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { theme } from "../../lib/theme";
import { toIsoDate } from "../../lib/date-format";

const CATEGORIES = treatmentCategorySchema.options;

export default function TreatmentsScreen() {
  const { t } = useTranslation();
  const [treatments, setTreatments] = useState<TreatmentDto[]>([]);
  const [loadingTreatments, setLoadingTreatments] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedImpactId, setExpandedImpactId] = useState<string | null>(null);
  const [impactState, setImpactState] = useState<
    Record<string, { loading: boolean; error: boolean; data: TreatmentImpactDto | null }>
  >({});

  const loadTreatments = useCallback(async () => {
    try {
      const page = await api.treatments.list({ pageSize: 50 });
      setTreatments(page.items);
    } finally {
      setLoadingTreatments(false);
    }
  }, []);

  useEffect(() => {
    void loadTreatments();
  }, [loadTreatments]);

  function resetForm() {
    setName("");
    setCategory(null);
    setStartDate(new Date());
    setOngoing(true);
    setEndDate(null);
    setNotes("");
  }

  async function handleSave() {
    setFormError(null);
    if (!name.trim() || !category || !startDate) {
      setFormError(t("treatments.fillRequiredFields"));
      return;
    }
    if (!ongoing && !endDate) {
      setFormError(t("treatments.pickEndDate"));
      return;
    }

    setSaving(true);
    try {
      await api.treatments.create({
        name: name.trim(),
        category,
        startDate: toIsoDate(startDate),
        endDate: !ongoing && endDate ? toIsoDate(endDate) : undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
      await loadTreatments();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("treatments.genericError"));
    } finally {
      setSaving(false);
    }
  }

  // "Stop taking this today" — the common real-world action against an
  // ongoing treatment. A full edit screen for every field is more than
  // this needs; ending is the one update people actually reach for.
  async function handleEndToday(id: string) {
    setEndingId(id);
    try {
      await api.treatments.update(id, { endDate: toIsoDate(new Date()) });
      await loadTreatments();
    } finally {
      setEndingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setTreatments((prev) => prev.filter((tr) => tr.id !== id));
    try {
      await api.treatments.delete(id);
    } catch {
      // Same optimistic-rollback pattern as the symptom log list — put
      // it back rather than let the UI silently drift from the server.
      await loadTreatments();
    } finally {
      setDeletingId(null);
    }
  }

  // Lazy, cached per treatment: fetched only the first time a row is
  // expanded, not for every treatment on screen load — matches
  // apps/web/src/app/treatments/page.tsx's identical toggleImpact.
  async function toggleImpact(id: string) {
    if (expandedImpactId === id) {
      setExpandedImpactId(null);
      return;
    }
    setExpandedImpactId(id);
    if (impactState[id]) return;

    setImpactState((prev) => ({ ...prev, [id]: { loading: true, error: false, data: null } }));
    try {
      const data = await api.treatments.impact(id);
      setImpactState((prev) => ({ ...prev, [id]: { loading: false, error: false, data } }));
    } catch {
      setImpactState((prev) => ({ ...prev, [id]: { loading: false, error: true, data: null } }));
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={treatments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t("treatments.title")}</Text>
            <Text style={styles.hint}>{t("treatments.hint")}</Text>

            <TextInput
              style={styles.input}
              placeholder={t("treatments.namePlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.sectionLabel}>{t("treatments.category")}</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={t(`enums.treatmentCategory.${c}`)}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("treatments.startDate")}</Text>
            <DatePickerField
              label={t("treatments.startDate")}
              value={startDate}
              onChange={setStartDate}
              maximumDate={new Date()}
            />

            <View style={styles.chipRow}>
              <Chip
                label={t("treatments.ongoing")}
                selected={ongoing}
                onPress={() => {
                  setOngoing(true);
                  setEndDate(null);
                }}
              />
              <Chip
                label={t("treatments.stopped")}
                selected={!ongoing}
                onPress={() => setOngoing(false)}
              />
            </View>

            {!ongoing && (
              <DatePickerField
                label={t("treatments.endDate")}
                value={endDate}
                onChange={setEndDate}
                minimumDate={startDate ?? undefined}
                maximumDate={new Date()}
              />
            )}

            <TextInput
              style={styles.notesInput}
              placeholder={t("treatments.notesPlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              <Text style={styles.buttonText}>
                {saving ? t("treatments.saving") : t("treatments.addTreatment")}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
              {t("treatments.currentAndPast")}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOngoing = !item.endDate;
          const impact = impactState[item.id];
          const expanded = expandedImpactId === item.id;
          return (
            <View style={styles.treatmentItem}>
              <View style={styles.treatmentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.treatmentName}>{item.name}</Text>
                  <Text style={styles.treatmentMeta}>
                    {t(`enums.treatmentCategory.${item.category}`)} · {item.startDate}
                    {" – "}
                    {isOngoing ? t("treatments.ongoing") : item.endDate}
                  </Text>
                  {item.notes && <Text style={styles.treatmentNotes}>{item.notes}</Text>}
                </View>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => void toggleImpact(item.id)}>
                    <Text style={styles.linkText}>
                      {expanded ? t("treatments.hideImpact") : t("treatments.showImpact")}
                    </Text>
                  </Pressable>
                  {isOngoing && (
                    <Pressable
                      onPress={() => void handleEndToday(item.id)}
                      disabled={endingId === item.id}
                    >
                      <Text style={styles.linkText}>
                        {endingId === item.id ? "…" : t("treatments.endToday")}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => void handleDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    <Text style={styles.deleteText}>
                      {deletingId === item.id ? "…" : t("treatments.delete")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {expanded && (
                <View style={styles.impactPanel}>
                  {!impact || impact.loading ? (
                    <Text style={styles.impactMuted}>{t("common.loading")}</Text>
                  ) : impact.error ? (
                    <Text style={styles.impactError}>{t("treatments.impactError")}</Text>
                  ) : impact.data!.insufficientData ? (
                    <Text style={styles.impactMuted}>{t("treatments.impactInsufficientData")}</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      <View style={styles.impactRow}>
                        <Text style={styles.impactLabel}>{t("treatments.impactBeforeLabel")}</Text>
                        <Text style={styles.impactValue}>
                          {impact.data!.before.logCount} ·{" "}
                          {t("treatments.impactWindow", { count: impact.data!.before.days })}
                        </Text>
                      </View>
                      <View style={styles.impactRow}>
                        <Text style={styles.impactLabel}>{t("treatments.impactAfterLabel")}</Text>
                        <Text style={styles.impactValue}>
                          {impact.data!.after.logCount} ·{" "}
                          {t("treatments.impactWindow", { count: impact.data!.after.days })}
                        </Text>
                      </View>
                      <Text style={styles.impactDisclaimer}>
                        {t("treatments.impactDisclaimer")}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          loadingTreatments ? (
            <LoadingState />
          ) : (
            <EmptyState icon="medkit-outline" label={t("treatments.noneYet")} />
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
  title: { fontSize: 22, fontWeight: "600", marginBottom: 4, color: theme.colors.textPrimary },
  hint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 4 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
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
  treatmentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  treatmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  treatmentName: { fontSize: 15, fontWeight: "500", color: theme.colors.textPrimary },
  treatmentMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  treatmentNotes: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  rowActions: { alignItems: "flex-end", gap: 6 },
  linkText: { fontSize: 13, color: theme.colors.success, fontWeight: "500" },
  deleteText: { fontSize: 13, color: theme.colors.error },
  impactPanel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.successSoft,
  },
  impactMuted: { fontSize: 13, color: theme.colors.textMuted },
  impactError: { fontSize: 13, color: theme.colors.error },
  impactRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  impactLabel: { fontSize: 13, color: theme.colors.textSecondary },
  impactValue: { fontSize: 13, fontWeight: "600", color: theme.colors.textPrimary },
  impactDisclaimer: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
