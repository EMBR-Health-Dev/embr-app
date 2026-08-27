import { useEffect, useState } from "react";
import type { ReflectionDto } from "@embr/types";
import { api } from "../lib/api";
import { dismissReflection, isReflectionDismissed } from "../lib/dismissed-reflections";
import { ReflectionCard } from "./reflection-card";

/**
 * Owns its own fetch rather than taking reflections as a prop —
 * matches this app's existing convention (organization page's
 * sub-sections each own their own data fetch too) and means the
 * dashboard doesn't need to know about the dismissal filtering at
 * all; it only ever needs to tell this component "something changed,
 * refetch" after a symptom log, via the `refreshKey` prop.
 */
export function ReflectionsSection({ refreshKey }: { refreshKey: number }) {
  const [reflections, setReflections] = useState<ReflectionDto[]>([]);

  useEffect(() => {
    api.reflections
      .list()
      .then((all) => setReflections(all.filter((r) => !isReflectionDismissed(r.id))))
      .catch(() => setReflections([]));
  }, [refreshKey]);

  function handleDismiss(id: string) {
    dismissReflection(id);
    setReflections((prev) => prev.filter((r) => r.id !== id));
  }

  if (reflections.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {reflections.map((reflection) => (
        <ReflectionCard key={reflection.id} reflection={reflection} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
