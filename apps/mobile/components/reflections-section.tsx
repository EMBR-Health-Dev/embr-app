import { useEffect, useState } from "react";
import { View } from "react-native";
import type { ReflectionDto } from "@embr/types";
import { api } from "../lib/api";
import { dismissReflection, filterDismissed } from "../lib/dismissed-reflections";
import { ReflectionCard } from "./reflection-card";

/** Owns its own fetch rather than taking reflections as a prop — same
 * reasoning as apps/web's ReflectionsSection. `refreshKey` changing is
 * the home screen's only way to say "something changed, refetch." */
export function ReflectionsSection({ refreshKey }: { refreshKey: number }) {
  const [reflections, setReflections] = useState<ReflectionDto[]>([]);

  useEffect(() => {
    api.reflections
      .list()
      .then((all) => filterDismissed(all))
      .then(setReflections)
      .catch(() => setReflections([]));
  }, [refreshKey]);

  async function handleDismiss(id: string) {
    await dismissReflection(id);
    setReflections((prev) => prev.filter((r) => r.id !== id));
  }

  if (reflections.length === 0) return null;

  return (
    <View>
      {reflections.map((reflection) => (
        <ReflectionCard key={reflection.id} reflection={reflection} onDismiss={handleDismiss} />
      ))}
    </View>
  );
}
