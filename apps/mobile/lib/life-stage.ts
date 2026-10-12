import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";
import { useAuth } from "./auth-context";

/** True only when she has said she is postmenopausal. Cycle length and
 * period tracking are hidden for her, but bleeding can still be logged:
 * it belongs in her record. Unanswered or unknown keeps the full view. */
export function isPostmenopause(lifeStage: string | null | undefined): boolean {
  return lifeStage === "POSTMENOPAUSE";
}

// One shared value for the tab bar and every screen, so a change in
// Settings shows everywhere at once. Keyed by user so a different
// account on the same phone never sees the previous answer.
let state: { userId: string | null; value: string | null | undefined } = {
  userId: null,
  value: undefined,
};
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(next: typeof state) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function setLifeStageCache(value: string | null): void {
  update({ ...state, value });
}

/** Her self reported life stage. undefined while loading, null when
 * unanswered or the request failed. */
export function useLifeStage(): string | null | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (!userId || state.userId === userId) return;
    update({ userId, value: undefined });
    api.onboarding
      .get()
      .then((profile) => {
        if (state.userId === userId) update({ userId, value: profile.lifeStage });
      })
      .catch(() => {
        if (state.userId === userId) update({ userId, value: null });
      });
  }, [userId]);

  return snapshot.userId === userId ? snapshot.value : undefined;
}
