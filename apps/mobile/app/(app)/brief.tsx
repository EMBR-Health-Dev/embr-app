import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { downloadAndShareBriefPdf } from "../../lib/brief-pdf";
import { theme } from "../../lib/theme";
import { DatePickerField } from "../../components/date-picker-field";
import { toIsoDate } from "../../lib/date-format";

export default function BriefScreen() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<ClinicalBriefDto | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const [history, setHistory] = useState<ClinicalBriefListItemDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openBriefId, setOpenBriefId] = useState<string | null>(null);
  const [openBrief, setOpenBrief] = useState<ClinicalBriefDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const page = await api.briefs.list({ pageSize: 20 });
      setHistory(page.items);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleGenerate() {
    setGenerateError(null);

    if (!fromDate || !toDate || fromDate > toDate) {
      setGenerateError(t("brief.invalidDates"));
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({
        fromDate: toIsoDate(fromDate),
        toDate: toIsoDate(toDate),
      });
      setJustGenerated(brief);
      await loadHistory();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : t("brief.generateError"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleShare(id: string) {
    setSharingId(id);
    try {
      await downloadAndShareBriefPdf(id);
    } catch {
      // Best-effort — the person can retry; not worth a blocking error
      // state for what's ultimately just "couldn't open the share
      // sheet."
    } finally {
      setSharingId(null);
    }
  }

  async function toggleBrief(id: string) {
    if (openBriefId === id) {
      setOpenBriefId(null);
      setOpenBrief(null);
      return;
    }
    setOpenBriefId(id);
    setOpenBrief(null);
    const brief = await api.briefs.get(id);
    setOpenBrief(brief);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.briefs.delete(id);
      setHistory((prev) => prev.filter((b) => b.id !== id));
      if (openBriefId === id) {
        setOpenBriefId(null);
        setOpenBrief(null);
      }
      if (justGenerated?.id === id) setJustGenerated(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t("brief.title")}</Text>
            <Text style={styles.hint}>{t("brief.hint")}</Text>

            <View style={styles.dateRow}>
              <DatePickerField
                label={t("brief.fromPlaceholder")}
                value={fromDate}
                onChange={setFromDate}
                maximumDate={toDate ?? new Date()}
              />
              <DatePickerField
                label={t("brief.toPlaceholder")}
                value={toDate}
                onChange={setToDate}
                minimumDate={fromDate ?? undefined}
                maximumDate={new Date()}
              />
            </View>
            {generateError && <Text style={styles.error}>{generateError}</Text>}

            <Pressable
              style={[styles.button, generating && styles.buttonDisabled]}
              onPress={() => void handleGenerate()}
              disabled={generating}
            >
              <Text style={styles.buttonText}>
                {generating ? t("brief.generating") : t("brief.generate")}
              </Text>
            </Pressable>

            {justGenerated && (
              <View style={styles.freshBrief}>
                <Text style={styles.freshBriefTitle}>{t("brief.briefReady")}</Text>
                <BriefContent brief={justGenerated} />
                <Pressable
                  onPress={() => void handleShare(justGenerated.id)}
                  disabled={sharingId === justGenerated.id}
                >
                  <Text style={styles.link}>
                    {sharingId === justGenerated.id ? t("brief.preparing") : t("brief.sharePdf")}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.sectionTitle]}>{t("brief.pastBriefs")}</Text>
            {historyLoading && <Text style={styles.emptyText}>{t("common.loading")}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.briefRow}>
            <View style={styles.briefRowHeader}>
              <Pressable onPress={() => void toggleBrief(item.id)} style={{ flex: 1 }}>
                <Text style={styles.briefRowTitle}>
                  {item.fromDate} to {item.toDate}
                </Text>
                <Text style={styles.briefRowMeta}>
                  {t("brief.generatedOn", { date: new Date(item.createdAt).toLocaleDateString() })}
                </Text>
              </Pressable>
              <Pressable onPress={() => void handleShare(item.id)} disabled={sharingId === item.id}>
                <Text style={styles.link}>{sharingId === item.id ? "…" : t("brief.pdf")}</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDelete(item.id)}
                disabled={deletingId === item.id}
                style={{ marginLeft: 16 }}
              >
                <Text style={styles.dangerText}>
                  {deletingId === item.id ? "…" : t("brief.delete")}
                </Text>
              </Pressable>
            </View>
            {openBriefId === item.id &&
              (openBrief ? (
                <BriefContent brief={openBrief} />
              ) : (
                <Text style={styles.emptyText}>{t("common.loading")}</Text>
              ))}
          </View>
        )}
        ListEmptyComponent={
          !historyLoading ? <Text style={styles.emptyText}>{t("brief.noBriefsYet")}</Text> : null
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  const { t } = useTranslation();
  return (
    <View style={styles.briefContent}>
      <Text style={styles.narrative}>{brief.aiNarrative}</Text>

      <Text style={styles.contentSectionTitle}>{t("brief.questionsForGp")}</Text>
      {brief.aiDiscussionTopics.map((topic, i) => (
        <Text key={i} style={styles.topic}>
          • {topic}
        </Text>
      ))}

      <Text style={styles.contentSectionTitle}>{t("brief.symptomFrequency")}</Text>
      {brief.symptomSummary.length === 0 ? (
        <Text style={styles.summaryLine}>{t("brief.noSymptomsInRange")}</Text>
      ) : (
        brief.symptomSummary.map((entry) => (
          <Text key={entry.category} style={styles.summaryLine}>
            {t(`enums.category.${entry.category}`)} —{" "}
            {t("brief.occurrenceCount", { count: entry.count })}
          </Text>
        ))
      )}

      <Text style={styles.contentSectionTitle}>{t("brief.cycleSummary")}</Text>
      <Text style={styles.summaryLine}>
        {brief.cycleSummary.averageCycleLengthDays === null
          ? t("brief.notEnoughCycleData")
          : t("brief.averageCycleLength", {
              days: brief.cycleSummary.averageCycleLengthDays,
              count: brief.cycleSummary.cycleCount,
            })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 4, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "600", color: theme.colors.textPrimary },
  hint: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4, marginBottom: 16 },
  dateRow: { flexDirection: "row", gap: 8 },
  error: { color: theme.colors.error, fontSize: 13, marginTop: 8 },
  button: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.surface, fontSize: 15, fontWeight: "600" },
  freshBrief: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  freshBriefTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 28,
    marginBottom: 4,
    color: theme.colors.textPrimary,
  },
  briefContent: { marginTop: 10, gap: 4 },
  narrative: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  contentSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    color: theme.colors.textPrimary,
  },
  topic: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  summaryLine: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  link: { fontSize: 13, color: theme.colors.success, fontWeight: "500" },
  dangerText: { fontSize: 13, color: theme.colors.error },
  briefRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  briefRowHeader: { flexDirection: "row", alignItems: "center" },
  briefRowTitle: { fontSize: 14, fontWeight: "500", color: theme.colors.textPrimary },
  briefRowMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, paddingVertical: 12 },
});
