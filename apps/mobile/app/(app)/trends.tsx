import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { CycleLengthEntryDto, SymptomFrequencyDto } from "@embr/types";
import { api } from "../../lib/api";
import { categoryLabel } from "../../lib/format";

const WINDOW_DAYS = 90;
const CYCLE_WINDOW_DAYS = 180;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function TrendsScreen() {
  const [frequency, setFrequency] = useState<SymptomFrequencyDto[]>([]);
  const [lengths, setLengths] = useState<CycleLengthEntryDto[]>([]);
  const [averageCycleLength, setAverageCycleLength] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Both trends are computed server-side (Milestone 9) — Postgres does
    // the GROUP BY / diffing over the full range, so this isn't subject
    // to any client-side page-size cap.
    Promise.all([
      api.trends.symptomFrequency({ from: daysAgoIso(WINDOW_DAYS) }),
      api.trends.cycleLength({ from: daysAgoIso(CYCLE_WINDOW_DAYS) }),
    ])
      .then(([symptomFrequency, cycleLength]) => {
        setFrequency(symptomFrequency);
        setLengths(cycleLength.lengths);
        setAverageCycleLength(cycleLength.averageDays);
      })
      .finally(() => setLoading(false));
  }, []);

  const maxCount = frequency[0]?.count ?? 1;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Trends</Text>

        {loading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Symptoms, last {WINDOW_DAYS} days</Text>
              {frequency.length === 0 ? (
                <Text style={styles.emptyText}>
                  Nothing logged in this window yet — patterns will show up here as you go.
                </Text>
              ) : (
                <View style={{ gap: 10, marginTop: 12 }}>
                  {frequency.map(({ category, count }) => (
                    <View key={category} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {categoryLabel(category)}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.max(6, (count / maxCount) * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.barCount}>{count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cycle length, last {CYCLE_WINDOW_DAYS} days</Text>
              {lengths.length === 0 ? (
                <Text style={styles.emptyText}>
                  Log at least two period-start days to see cycle lengths here. Irregular or absent
                  cycles are common in perimenopause — this is a record for you and your provider,
                  not a diagnosis.
                </Text>
              ) : (
                <>
                  {averageCycleLength !== null && (
                    <Text style={styles.averageText}>
                      Averaging <Text style={{ fontWeight: "600" }}>{averageCycleLength} days</Text>{" "}
                      between period starts over this window.
                    </Text>
                  )}
                  <View style={{ marginTop: 12 }}>
                    {lengths.map((l) => (
                      <View key={l.to} style={styles.lengthRow}>
                        <Text style={styles.lengthRange}>
                          {l.from} → {l.to}
                        </Text>
                        <Text style={styles.lengthDays}>{l.days} days</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.footnote}>
                    Cycle irregularity is expected during perimenopause — this view is here to help
                    you notice your own pattern, not to flag it as a problem.
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "600" },
  loadingText: { fontSize: 14, color: "#9CA3AF", marginTop: 16 },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  emptyText: { fontSize: 13, color: "#6B7280", marginTop: 8, lineHeight: 19 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { width: 110, fontSize: 13, color: "#111827" },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "#F3F4F6" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: "#B08D57" },
  barCount: { width: 24, textAlign: "right", fontSize: 13, color: "#6B7280" },
  averageText: { fontSize: 13, color: "#374151", marginTop: 8 },
  lengthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lengthRange: { fontSize: 13, color: "#6B7280" },
  lengthDays: { fontSize: 13, fontWeight: "500", color: "#111827" },
  footnote: { fontSize: 11, color: "#9CA3AF", marginTop: 12, lineHeight: 16 },
});
