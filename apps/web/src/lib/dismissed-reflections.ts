const STORAGE_KEY = "embr.dismissedReflectionIds";

/**
 * Dismissal is purely a browser-local UI preference, not server state
 * — a reflection's `id` already encodes the period/anchor it's about
 * (see apps/api/.../reflection-generator.ts), so once that period
 * ends the id changes and a fresh instance reappears on its own,
 * without needing any expiry logic here. Deliberately not
 * server-persisted: it's not clinical data, and keeping it local means
 * this feature needs no new Prisma model or migration.
 *
 * Guarded for SSR/no-window the same way any browser-only storage
 * access in a Next.js app needs to be — this module can be imported
 * during server rendering even though it's only ever meaningfully
 * called client-side.
 */
function readDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function isReflectionDismissed(id: string): boolean {
  return readDismissedIds().has(id);
}

export function dismissReflection(id: string): void {
  if (typeof window === "undefined") return;
  const ids = readDismissedIds();
  ids.add(id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can legitimately fail (private browsing, quota) — a
    // reflection reappearing on next load is a minor inconvenience,
    // not worth surfacing an error for.
  }
}
