import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-client";
import { categoryLabel } from "../../lib/format";
import { downloadAndShareBriefPdf } from "../../lib/brief-pdf";

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

export default function BriefScreen() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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

    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      setGenerateError("Enter both dates as YYYY-MM-DD.");
      return;
    }

    setGenerating(true);
    try {
      const brief = await api.briefs.generate({ fromDate, toDate });
      setJustGenerated(brief);
      await loadHistory();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : "Couldn't generate a brief.");
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
            <Text style={styles.title}>EMBR BRIEF</Text>
            <Text style={styles.hint}>
              A summary of your tracked data, with questions to bring to your GP — not a diagnosis,
              and not medical advice.
            </Text>

            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.dateInput]}
                placeholder="From (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                value={fromDate}
                onChangeText={setFromDate}
              />
              <TextInput
                style={[styles.input, styles.dateInput]}
                placeholder="To (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                value={toDate}
                onChangeText={setToDate}
              />
            </View>
            {generateError && <Text style={styles.error}>{generateError}</Text>}

            <Pressable
              style={[styles.button, generating && styles.buttonDisabled]}
              onPress={() => void handleGenerate()}
              disabled={generating}
            >
              <Text style={styles.buttonText}>{generating ? "Generating…" : "Generate brief"}</Text>
            </Pressable>

            {justGenerated && (
              <View style={styles.freshBrief}>
                <Text style={styles.freshBriefTitle}>Your brief is ready</Text>
                <BriefContent brief={justGenerated} />
                <Pressable
                  onPress={() => void handleShare(justGenerated.id)}
                  disabled={sharingId === justGenerated.id}
                >
                  <Text style={styles.link}>
                    {sharingId === justGenerated.id ? "Preparing…" : "Share / Save PDF"}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.sectionTitle]}>Past briefs</Text>
            {historyLoading && <Text style={styles.emptyText}>Loading…</Text>}
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
                  generated {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </Pressable>
              <Pressable onPress={() => void handleShare(item.id)} disabled={sharingId === item.id}>
                <Text style={styles.link}>{sharingId === item.id ? "…" : "PDF"}</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDelete(item.id)}
                disabled={deletingId === item.id}
                style={{ marginLeft: 16 }}
              >
                <Text style={styles.dangerText}>{deletingId === item.id ? "…" : "Delete"}</Text>
              </Pressable>
            </View>
            {openBriefId === item.id &&
              (openBrief ? (
                <BriefContent brief={openBrief} />
              ) : (
                <Text style={styles.emptyText}>Loading…</Text>
              ))}
          </View>
        )}
        ListEmptyComponent={
          !historyLoading ? <Text style={styles.emptyText}>No briefs generated yet.</Text> : null
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

function BriefContent({ brief }: { brief: ClinicalBriefDto }) {
  return (
    <View style={styles.briefContent}>
      <Text style={styles.narrative}>{brief.aiNarrative}</Text>

      <Text style={styles.contentSectionTitle}>Questions to bring to your GP</Text>
      {brief.aiDiscussionTopics.map((topic, i) => (
        <Text key={i} style={styles.topic}>
          • {topic}
        </Text>
      ))}

      <Text style={styles.contentSectionTitle}>Symptom frequency</Text>
      {brief.symptomSummary.length === 0 ? (
        <Text style={styles.summaryLine}>No symptoms logged in this range.</Text>
      ) : (
        brief.symptomSummary.map((entry) => (
          <Text key={entry.category} style={styles.summaryLine}>
            {categoryLabel(entry.category)} — {entry.count} occurrence{entry.count === 1 ? "" : "s"}
          </Text>
        ))
      )}

      <Text style={styles.contentSectionTitle}>Cycle summary</Text>
      <Text style={styles.summaryLine}>
        {brief.cycleSummary.averageCycleLengthDays === null
          ? "Not enough period-start entries in this range to compute cycle length."
          : `Average cycle length: ${brief.cycleSummary.averageCycleLengthDays} days (${brief.cycleSummary.cycleCount} cycles recorded)`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  listContent: { padding: 20, paddingBottom: 40 },
  header: { gap: 4, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "600" },
  hint: { fontSize: 13, color: "#6B7280", marginTop: 4, marginBottom: 16 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: "#DC2626", fontSize: 13, marginTop: 8 },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  freshBrief: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  freshBriefTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginTop: 28, marginBottom: 4 },
  briefContent: { marginTop: 10, gap: 4 },
  narrative: { fontSize: 14, color: "#374151", lineHeight: 20 },
  contentSectionTitle: { fontSize: 13, fontWeight: "600", marginTop: 12, color: "#111827" },
  topic: { fontSize: 13, color: "#374151", marginTop: 2 },
  summaryLine: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  link: { fontSize: 13, color: "#2563EB", fontWeight: "500" },
  dangerText: { fontSize: 13, color: "#DC2626" },
  briefRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  briefRowHeader: { flexDirection: "row", alignItems: "center" },
  briefRowTitle: { fontSize: 14, fontWeight: "500" },
  briefRowMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  emptyText: { fontSize: 14, color: "#9CA3AF", paddingVertical: 12 },
});
