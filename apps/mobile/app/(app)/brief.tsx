import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { BriefTrendsDto, ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { downloadAndShareBriefPdf } from "../../lib/brief-pdf";
import { theme } from "../../lib/theme";
import { DatePickerField } from "../../components/date-picker-field";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
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
  const [trends, setTrends] = useState<BriefTrendsDto | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const page = await api.briefs.list({ pageSize: 20 });
      setHistory(page.items);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadTrends = useCallback(async () => {
    // Independent of loadHistory — evidence aggregation over the
    // user's own recent briefs, not tied to the paginated history
    // list's own loading state or page size. Best-effort: if this
    // fails, the section simply doesn't render (trends stays null) —
    // nothing else on the screen depends on it, so it's not worth a
    // blocking error state of its own.
    try {
      const result = await api.briefs.trends();
      setTrends(result);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

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
      await loadTrends();
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

            {trendsLoading && <LoadingState compact />}
            {trends && trends.briefCount > 0 && (
              <View style={styles.trendsSection}>
                <Text style={styles.sectionTitle}>{t("brief.trendsTitle")}</Text>
                <Text style={styles.hint}>
                  {t("brief.trendsAcrossBriefs", { count: trends.briefCount })}
                </Text>
                {trends.categories.map((row) => {
                  // Two-step composition, same reasoning as
                  // frequencyComparisonEntry/treatmentImpactEntry
                  // above: i18next's automatic _one/_other suffix
                  // selection works off a single `count` per t() call,
                  // and "total" here needs its own independent
                  // pluralized "brief(s)" phrase composed into the
                  // full sentence.
                  const totalPhrase = t("brief.briefCountPhrase", { count: row.totalBriefs });
                  return (
                    <Text key={row.category} style={styles.summaryLine}>
                      {t("brief.trendsCategoryLine", {
                        category: t(`enums.category.${row.category}`),
                        present: row.briefsPresent,
                        totalPhrase,
                        persistent: row.briefsPersistent,
                      })}
                    </Text>
                  );
                })}
              </View>
            )}

            <Text style={[styles.sectionTitle]}>{t("brief.pastBriefs")}</Text>
            {historyLoading && <LoadingState label={t("common.loading")} compact />}
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
              (openBrief ? <BriefContent brief={openBrief} /> : <LoadingState compact />)}
          </View>
        )}
        ListEmptyComponent={
          historyLoading ? null : (
            <EmptyState icon="document-text-outline" label={t("brief.noBriefsYet")} />
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

function formatSeverityBreakdown(
  severityBreakdown: Record<string, number>,
  t: (key: string) => string,
  locale: string,
): string {
  // Same {severity: count} shape brief.pdf.ts has always rendered — no
  // new data, this just brings the in-app view to parity with what the
  // PDF already shows. Intl.ListFormat (not a hardcoded ", " join)
  // handles locale-appropriate separators — Japanese conventionally
  // uses "、" rather than a Latin comma-space, so a hardcoded English
  // separator would have been a real, if small, localization
  // regression for ja specifically.
  const parts = Object.entries(severityBreakdown).map(
    ([severity, count]) => `${count} ${t(`enums.severity.${severity}`)}`,
  );
  return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(parts);
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.briefContent}>
      <Text style={styles.narrative}>{brief.aiNarrative}</Text>

      {brief.citedPatternIds && brief.citedPatternIds.length > 0 && brief.interpretation && (
        <>
          <Text style={styles.contentSectionTitle}>{t("brief.groundedInTitle")}</Text>
          {brief.citedPatternIds.map((id) => {
            const pattern = brief.interpretation!.patterns.find((entry) => entry.id === id);
            // Should always resolve — citedPatternIds is only ever
            // populated from ids validateStage4Patterns already
            // confirmed exist in this same interpretation (see
            // brief.service.ts). Skips rather than throws if it
            // somehow doesn't, so a single unexpected id can't take
            // down the whole screen.
            if (!pattern) return null;
            return (
              <Text key={id} style={styles.summaryLine}>
                {pattern.observation}
                {pattern.association ? ` ${pattern.association}` : ""}
              </Text>
            );
          })}
        </>
      )}

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
            {t("brief.occurrenceCount", { count: entry.count })} (
            {formatSeverityBreakdown(entry.severityBreakdown, t, i18n.language)})
          </Text>
        ))
      )}

      {brief.frequencyComparison && brief.frequencyComparison.length > 0 && (
        <>
          <Text style={styles.contentSectionTitle}>{t("brief.frequencyComparisonTitle")}</Text>
          {brief.frequencyComparison.map((entry) => {
            // i18next's automatic _one/_other plural suffix selection
            // works off a single `count` option per t() call — this
            // sentence needs two independently-pluralized counts
            // (currentCount and previousCount), so each is formatted
            // on its own via frequencyComparisonDayCount first, then
            // composed into the full sentence. The web equivalent
            // (page.tsx) uses next-intl's ICU {count, plural, ...},
            // which supports multiple independent plural clauses in
            // one message natively — this two-step composition is
            // i18next's own established way to get the same result,
            // not a workaround invented for this feature specifically.
            const current = t("brief.frequencyComparisonDayCount", {
              count: entry.currentCount,
            });
            const previous = t("brief.frequencyComparisonDayCount", {
              count: entry.previousCount,
            });
            return (
              <Text key={entry.category} style={styles.summaryLine}>
                {t(`enums.category.${entry.category}`)}:{" "}
                {t("brief.frequencyComparisonEntry", { current, previous })}
              </Text>
            );
          })}
        </>
      )}

      {brief.persistentSymptoms && brief.persistentSymptoms.length > 0 && (
        <>
          <Text style={styles.contentSectionTitle}>{t("brief.persistentSymptomsTitle")}</Text>
          {brief.persistentSymptoms.map((category) => (
            <Text key={category} style={styles.summaryLine}>
              {t("brief.persistentSymptomsEntry", {
                category: t(`enums.category.${category}`),
              })}
            </Text>
          ))}
        </>
      )}

      {brief.coOccurrence && (
        <>
          <Text style={styles.contentSectionTitle}>{t("brief.patternsNoticedTitle")}</Text>
          <Text style={styles.summaryLine}>
            {t("brief.coOccurrenceEntry", {
              count: brief.coOccurrence.days,
              categoryA: t(`enums.category.${brief.coOccurrence.categoryA}`),
              categoryB: t(`enums.category.${brief.coOccurrence.categoryB}`),
            })}
          </Text>
        </>
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

      <Text style={styles.contentSectionTitle}>{t("brief.treatmentsLoggedDuringPeriod")}</Text>
      {brief.treatmentSummary.length === 0 ? (
        <Text style={styles.summaryLine}>{t("brief.noTreatmentsInRange")}</Text>
      ) : (
        brief.treatmentSummary.map((entry, i) => (
          <Text key={i} style={styles.summaryLine}>
            {entry.name} — {t(`enums.treatmentCategory.${entry.category}`)}, {entry.startDate} –{" "}
            {entry.endDate ?? t("brief.ongoing")}
          </Text>
        ))
      )}
      <Text style={styles.treatmentSafetyNote}>{t("brief.treatmentSafetyNote")}</Text>

      {brief.treatmentImpact && brief.treatmentImpact.length > 0 && (
        <>
          <Text style={styles.contentSectionTitle}>{t("brief.treatmentImpactTitle")}</Text>
          {brief.treatmentImpact.map((entry) => {
            // Same two-step composition as frequencyComparison above —
            // beforeCount and afterCount each need independent
            // pluralization, which i18next's single-count-per-call
            // mechanism doesn't support directly.
            const before = t("brief.treatmentImpactLogCount", { count: entry.before.logCount });
            const after = t("brief.treatmentImpactLogCount", { count: entry.after.logCount });
            return (
              <Text key={entry.treatmentId} style={styles.summaryLine}>
                {entry.name}:{" "}
                {entry.insufficientData
                  ? t("brief.treatmentImpactInsufficientData")
                  : t("brief.treatmentImpactEntry", {
                      before,
                      after,
                      beforeDays: entry.before.days,
                      afterDays: entry.after.days,
                    })}
              </Text>
            );
          })}
          <Text style={styles.treatmentSafetyNote}>{t("brief.treatmentSafetyNote")}</Text>
        </>
      )}
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
  trendsSection: { marginTop: 20 },
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
  treatmentSafetyNote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 6,
    lineHeight: 15,
  },
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
});
