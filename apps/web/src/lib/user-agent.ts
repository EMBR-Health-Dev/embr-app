// A small, deterministic parser for exactly what Settings' device list
// needs to show: "<Browser> on <Platform>" for the handful of common
// combinations a real user actually has, never the raw string. Not a
// general-purpose UA library — order matters below (Edge and Opera
// UAs also contain "Chrome" and "Safari"; Chrome UAs also contain
// "Safari"), and there is deliberately no dependency added for this:
// see the beta-readiness audit's own note that ua-parser-js only
// exists in this repo as a transitive dependency of apps/mobile's Expo
// tooling, not something apps/web can rely on.
function detectBrowser(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return "Opera";
  if (/FxiOS\//.test(userAgent)) return "Firefox";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/CriOS\//.test(userAgent)) return "Chrome";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Version\//.test(userAgent) && /Safari\//.test(userAgent)) return "Safari";
  return null;
}

function detectPlatform(userAgent: string): string | null {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return "Android";
  if (/Mac OS X/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/CrOS/.test(userAgent)) return "Chrome OS";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

/** Formats a raw User-Agent header into a short, human-readable device
 * label (e.g. "Chrome on Mac"). Returns null when nothing recognizable
 * could be extracted, so the caller can fall back to its own copy
 * (e.g. "Unknown device") rather than this module owning that string. */
export function formatDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;

  const browser = detectBrowser(userAgent);
  const platform = detectPlatform(userAgent);

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform;
}
