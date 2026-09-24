import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type {
  BriefTrendsDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  Stage4Pattern,
} from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { downloadAndShareBriefPdf } from "../../lib/brief-pdf";
import { theme } from "../../lib/theme";
import { DatePickerField } from "../../components/date-picker-field";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { endOfLocalDay, startOfLocalDay } from "../../lib/date-format";

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
        fromDate: startOfLocalDay(fromDate),
        toDate: endOfLocalDay(toDate),
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
            {generateError && (
              <View style={styles.errorCallout}>
                <Text style={styles.error}>{generateError}</Text>
                <Text style={styles.errorReassurance}>{t("brief.generateErrorReassurance")}</Text>
              </View>
            )}

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
                {trends.longitudinalPatterns.length > 0 && (
                  <View style={styles.longitudinalSection}>
                    <Text style={styles.sectionTitle}>{t("brief.longitudinalPatternsTitle")}</Text>
                    {trends.longitudinalPatterns.map((pattern) => (
                      <Text key={pattern.id} style={styles.summaryLine}>
                        {t("brief.longitudinalPatternsLine", {
                          category: t(`enums.category.${pattern.category}`),
                          totalPhrase: t("brief.briefCountPhrase", { count: pattern.totalBriefs }),
                        })}
                      </Text>
                    ))}
                  </View>
                )}
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

// Resolves a cited Stage4Pattern back to the raw evidence object it was
// built from — everything here (frequencyComparison, coOccurrence,
// treatmentImpact) is already on ClinicalBriefDto, sent to the client
// today, just not yet linked back to the pattern that cites it. Returns
// null rather than throwing when nothing matches (an old brief whose
// interpretation predates one of these fields, or a pattern type this
// resolver doesn't yet cover) — a citation with no resolvable evidence
// still has its observation/caveat text to show, it just skips the
// numeric detail underneath. Same logic as apps/web/src/app/brief/page.tsx's
// resolveEvidence — no shared UI-logic package exists between web and
// mobile (see formatSeverityBreakdown above, duplicated the same way).
type ResolvedEvidence =
  | { kind: "frequency"; currentCount: number; previousCount: number }
  | { kind: "coOccurrence"; days: number; categoryA: string; categoryB: string }
  | {
      kind: "treatmentImpact";
      beforeCount: number;
      beforeDays: number;
      afterCount: number;
      afterDays: number;
    };

function resolveEvidence(pattern: Stage4Pattern, brief: ClinicalBriefDto): ResolvedEvidence | null {
  const ref = pattern.evidenceRef;
  if ("category" in ref) {
    const entry = brief.frequencyComparison?.find((e) => e.category === ref.category);
    return entry
      ? { kind: "frequency", currentCount: entry.currentCount, previousCount: entry.previousCount }
      : null;
  }
  if ("categoryA" in ref) {
    const co = brief.coOccurrence;
    return co && co.categoryA === ref.categoryA && co.categoryB === ref.categoryB
      ? { kind: "coOccurrence", days: co.days, categoryA: co.categoryA, categoryB: co.categoryB }
      : null;
  }
  const entry = brief.treatmentImpact?.find((e) => e.treatmentId === ref.treatmentId);
  return entry && !entry.insufficientData
    ? {
        kind: "treatmentImpact",
        beforeCount: entry.before.logCount,
        beforeDays: entry.before.days,
        afterCount: entry.after.logCount,
        afterDays: entry.after.days,
      }
    : null;
}

// Reuses the exact same i18n messages (and the same two-step pluralization
// composition) the standalone frequency/co-occurrence/treatment-impact
// sections further down this file already use — this is the same numbers,
// just surfaced next to the citation that's grounded in them.
function formatEvidenceLine(
  resolved: ResolvedEvidence,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (resolved.kind) {
    case "frequency": {
      const current = t("brief.frequencyComparisonDayCount", { count: resolved.currentCount });
      const previous = t("brief.frequencyComparisonDayCount", { count: resolved.previousCount });
      return t("brief.frequencyComparisonEntry", { current, previous });
    }
    case "coOccurrence":
      return t("brief.coOccurrenceEntry", {
        count: resolved.days,
        categoryA: t(`enums.category.${resolved.categoryA}`),
        categoryB: t(`enums.category.${resolved.categoryB}`),
      });
    case "treatmentImpact": {
      const before = t("brief.treatmentImpactLogCount", { count: resolved.beforeCount });
      const after = t("brief.treatmentImpactLogCount", { count: resolved.afterCount });
      return t("brief.treatmentImpactEntry", {
        before,
        after,
        beforeDays: resolved.beforeDays,
        afterDays: resolved.afterDays,
      });
    }
  }
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  const { t, i18n } = useTranslation();
  const [expandedPatternIds, setExpandedPatternIds] = useState<Set<string>>(new Set());

  function toggleEvidence(id: string) {
    setExpandedPatternIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
            const expanded = expandedPatternIds.has(id);
            const resolved = resolveEvidence(pattern, brief);
            return (
              <View key={id} style={styles.evidenceItem}>
                <Text style={styles.summaryLine}>
                  {pattern.observation}
                  {pattern.association ? ` ${pattern.association}` : ""}
                </Text>
                <Pressable onPress={() => toggleEvidence(id)}>
                  <Text style={styles.link}>
                    {expanded ? t("brief.hideEvidence") : t("brief.viewEvidence")}
                  </Text>
                </Pressable>
                {expanded && (
                  <View style={styles.evidenceDetail}>
                    {resolved && (
                      <Text style={styles.evidenceLine}>{formatEvidenceLine(resolved, t)}</Text>
                    )}
                    <Text style={styles.evidenceLine}>{pattern.caveat}</Text>
                    <Text style={styles.evidenceMeta}>
                      {t("brief.evidenceSourceLabel")}: {t("brief.evidenceSourceSelfReported")}
                    </Text>
                    <Text style={styles.evidenceMeta}>
                      {t("brief.evidenceConfidenceLabel")}:{" "}
                      {t("brief.evidenceConfidenceDescriptive")}
                    </Text>
                  </View>
                )}
              </View>
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
            {t(`enums.category.${entry.category}`)}:{" "}
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
            {entry.name}: {t(`enums.treatmentCategory.${entry.category}`)}, {entry.startDate} –{" "}
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
  errorCallout: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  error: { color: theme.colors.error, fontSize: 13 },
  errorReassurance: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
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
  longitudinalSection: { marginTop: 12 },
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
  evidenceItem: { marginTop: 4 },
  evidenceDetail: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  evidenceLine: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 16 },
  evidenceMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
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
