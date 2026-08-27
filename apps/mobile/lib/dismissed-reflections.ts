import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "embr_dismissed_reflection_ids";

/**
 * Dismissal is purely an on-device UI preference, not server state —
 * a reflection's `id` already encodes the period/anchor it's about
 * (see apps/api/.../reflection-generator.ts), so once that period ends
 * the id changes and a fresh instance reappears on its own, without
 * needing any expiry logic here. Deliberately not server-persisted:
 * it's not clinical data, and keeping it on-device means this feature
 * needs no new Prisma model or migration.
 *
 * Uses expo-secure-store the same way token-storage.ts does — not
 * because this data is sensitive (it isn't), but because it's already
 * the one on-device key/value store this app depends on, and adding a
 * second storage dependency (e.g. AsyncStorage) for a handful of
 * non-sensitive string IDs isn't worth a new dependency for this MVP.
 */
async function readDismissedIds(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export async function isReflectionDismissed(id: string): Promise<boolean> {
  const ids = await readDismissedIds();
  return ids.has(id);
}

export async function dismissReflection(id: string): Promise<void> {
  const ids = await readDismissedIds();
  ids.add(id);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // A reflection reappearing on next load is a minor inconvenience,
    // not worth surfacing an error for — same as the web version.
  }
}

/** Filters a full reflection list down to the ones not yet dismissed
 * — one read of the stored set, not one SecureStore call per
 * reflection, since there are only ever a handful of reflections at a
 * time but no reason to serialize N sequential async reads. */
export async function filterDismissed<T extends { id: string }>(reflections: T[]): Promise<T[]> {
  const dismissedIds = await readDismissedIds();
  return reflections.filter((r) => !dismissedIds.has(r.id));
}
