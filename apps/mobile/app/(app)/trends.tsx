import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { CycleLengthEntryDto, SymptomFrequencyDto } from "@embr/types";
import { api } from "../../lib/api";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { theme } from "../../lib/theme";

const WINDOW_DAYS = 90;
const CYCLE_WINDOW_DAYS = 180;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function TrendsScreen() {
  const { t } = useTranslation();
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
        <Text style={styles.title}>{t("trends.title")}</Text>

        {loading ? (
          <LoadingState label={t("common.loading")} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t("trends.symptomsHeader", { days: WINDOW_DAYS })}
              </Text>
              {frequency.length === 0 ? (
                <EmptyState icon="pulse-outline" label={t("trends.noSymptomsYet")} />
              ) : (
                <View style={{ gap: 10, marginTop: 12 }}>
                  {frequency.map(({ category, count }) => (
                    <View key={category} style={styles.barRow}>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {t(`enums.category.${category}`)}
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
              <Text style={styles.sectionTitle}>
                {t("trends.cycleLengthHeader", { days: CYCLE_WINDOW_DAYS })}
              </Text>
              {lengths.length === 0 ? (
                <EmptyState icon="calendar-outline" label={t("trends.noCycleDataYet")} />
              ) : (
                <>
                  {averageCycleLength !== null && (
                    <Text style={styles.averageText}>
                      {t("trends.averagingPrefix")}
                      <Text style={{ fontWeight: "600" }}>
                        {averageCycleLength} {t("trends.daysUnit")}
                      </Text>
                      {t("trends.averagingSuffix")}
                    </Text>
                  )}
                  <View style={{ marginTop: 12 }}>
                    {lengths.map((l) => (
                      <View key={l.to} style={styles.lengthRow}>
                        <Text style={styles.lengthRange}>
                          {l.from} → {l.to}
                        </Text>
                        <Text style={styles.lengthDays}>
                          {l.days} {t("trends.daysUnit")}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.footnote}>{t("trends.irregularityNote")}</Text>
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
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "600", color: theme.colors.textPrimary },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.textPrimary },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { width: 110, fontSize: 13, color: theme.colors.textPrimary },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.colors.border },
  barFill: { height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  barCount: { width: 24, textAlign: "right", fontSize: 13, color: theme.colors.textMuted },
  averageText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8 },
  lengthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  lengthRange: { fontSize: 13, color: theme.colors.textMuted },
  lengthDays: { fontSize: 13, fontWeight: "500", color: theme.colors.textPrimary },
  footnote: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12, lineHeight: 16 },
});
