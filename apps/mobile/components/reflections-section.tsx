import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ReflectionDto } from "@embr/types";
import { api } from "../lib/api";
import { theme } from "../lib/theme";
import { ReflectionCard } from "./reflection-card";

/**
 * `refreshKey` is expected to change whenever a new symptom log is
 * successfully submitted (see (app)/index.tsx) — that's the
 * "acknowledgement after logging" the Reflection MVP calls for:
 * logging something new can immediately surface a reflection that
 * wasn't there before (e.g. crossing the 3-log threshold), without
 * this component polling on its own.
 */
export function ReflectionsSection({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const [reflections, setReflections] = useState<ReflectionDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Same fetch-on-mount / fetch-on-dependency-change pattern as
    // co-occurrence-card.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    api.reflections
      .list()
      .then((data) => {
        if (!cancelled) setReflections(data);
      })
      .catch(() => {
        // Fails quietly, same convention as CoOccurrenceCard — a
        // supplementary surface, not core functionality. The rest of
        // the home screen (logging, recent logs) works either way.
        if (!cancelled) setReflections([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDismiss(reflection: ReflectionDto) {
    setReflections((prev) => prev.filter((r) => r.key !== reflection.key));
    try {
      await api.reflections.dismiss({ type: reflection.type, key: reflection.key });
    } catch {
      // Didn't stick server-side — put it back rather than let the
      // dismissal silently fail to persist.
      setReflections((prev) => [...prev, reflection]);
    }
  }

  if (loading || reflections.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t("home.yourWeek")}</Text>
      {reflections.map((reflection) => (
        <ReflectionCard
          key={`${reflection.type}:${reflection.key}`}
          reflection={reflection}
          onDismiss={() => void handleDismiss(reflection)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 28 },
  heading: { fontSize: 14, fontWeight: "500", color: theme.colors.textSecondary },
});
