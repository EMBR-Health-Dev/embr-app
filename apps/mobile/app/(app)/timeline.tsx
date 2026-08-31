import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TimelineEventDto } from "@embr/types";
import { api } from "../../lib/api";
import { EmptyState } from "../../components/empty-state";
import { LoadingState } from "../../components/loading-state";
import { theme } from "../../lib/theme";

const WINDOW_DAYS = 180;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Same neutral dot-per-type convention as the web timeline
 * (apps/web/src/app/timeline/page.tsx) — accent (brass) for symptom
 * weeks, success/teal for a started treatment, muted border for an
 * ended one, navy for a generated brief. No icon set beyond that; the
 * doctrine's design principle (calm, clinical, not gamified) argues
 * against a bespoke icon per event type here. */
const EVENT_DOT: Record<TimelineEventDto["type"], string> = {
  SYMPTOM_WEEK: theme.colors.accent,
  TREATMENT_STARTED: theme.colors.success,
  TREATMENT_ENDED: theme.colors.borderStrong,
  BRIEF_GENERATED: theme.colors.textPrimary,
};

export default function TimelineScreen() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TimelineEventDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.timeline
      .get({ from: daysAgoIso(WINDOW_DAYS) })
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t("timeline.title")}</Text>
        <Text style={styles.subtitle}>{t("timeline.subtitle")}</Text>

        {loading ? (
          <LoadingState label={t("common.loading")} />
        ) : events.length === 0 ? (
          <EmptyState icon="time-outline" label={t("timeline.empty")} />
        ) : (
          <View style={styles.list}>
            {events.map((event, i) => (
              <View key={`${event.type}-${event.date}-${i}`} style={styles.row}>
                <View style={styles.dotColumn}>
                  <View style={[styles.dot, { backgroundColor: EVENT_DOT[event.type] }]} />
                  {i < events.length - 1 && <View style={styles.connector} />}
                </View>

                <View style={styles.rowContent}>
                  <Text style={styles.date}>{event.date}</Text>

                  {event.type === "SYMPTOM_WEEK" && (
                    <>
                      <Text style={styles.rowTitle}>
                        {t("timeline.symptomWeekTitle", { weekStart: event.weekStart })}
                      </Text>
                      <Text style={styles.rowDetail}>
                        {t("timeline.symptomWeekCount", { count: event.totalCount })}
                        {event.percentChangeFromPreviousNonEmptyWeek !== null &&
                          (event.percentChangeFromPreviousNonEmptyWeek >= 0
                            ? "  " +
                              t("timeline.symptomWeekChangeUp", {
                                percent: event.percentChangeFromPreviousNonEmptyWeek,
                              })
                            : "  " +
                              t("timeline.symptomWeekChangeDown", {
                                percent: event.percentChangeFromPreviousNonEmptyWeek,
                              }))}
                      </Text>
                      {event.categoryCounts.length > 0 && (
                        <Text style={styles.categoryLine} numberOfLines={2}>
                          {event.categoryCounts
                            .map((c) => `${t(`enums.category.${c.category}`)} · ${c.count}`)
                            .join("   ")}
                        </Text>
                      )}
                    </>
                  )}

                  {(event.type === "TREATMENT_STARTED" || event.type === "TREATMENT_ENDED") && (
                    <Text style={styles.rowTitle}>
                      {event.type === "TREATMENT_STARTED"
                        ? t("timeline.treatmentStarted", { name: event.name })
                        : t("timeline.treatmentEnded", { name: event.name })}
                      <Text style={styles.rowDetail}>
                        {" "}
                        {t(`enums.treatmentCategory.${event.category}`)}
                      </Text>
                    </Text>
                  )}

                  {event.type === "BRIEF_GENERATED" && (
                    <>
                      <Text style={styles.rowTitle}>{t("timeline.briefGenerated")}</Text>
                      <Text style={styles.rowDetail}>
                        {t("timeline.briefGeneratedRange", {
                          fromDate: event.fromDate,
                          toDate: event.toDate,
                        })}
                      </Text>
                      <Text style={styles.link} onPress={() => router.push("/brief")}>
                        {t("timeline.viewBrief")}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "600", color: theme.colors.textPrimary },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  list: { marginTop: 20 },
  row: { flexDirection: "row" },
  dotColumn: { width: 20, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  connector: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 2 },
  rowContent: { flex: 1, paddingBottom: 20 },
  date: { fontSize: 11, color: theme.colors.textMuted },
  rowTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.textPrimary, marginTop: 2 },
  rowDetail: { fontSize: 13, fontWeight: "400", color: theme.colors.textSecondary, marginTop: 2 },
  categoryLine: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  link: { fontSize: 12, fontWeight: "600", color: theme.colors.success, marginTop: 6 },
});
