import type { SharedBriefDto } from "@embr/types";

/**
 * The clinician's side of a share link. Plain fetch, not apiFetch: there
 * is no session here to refresh, a 403 means a wrong code (not an expired
 * login), and no cookie of the viewer's is sent. The token and code go
 * in the request body, never in a URL.
 */
export class SharedBriefError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post(path: string, token: string, code: string): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, code }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new SharedBriefError(res.status, json?.error?.message ?? "Something went wrong");
  }
  return res;
}

export async function openSharedBrief(token: string, code: string): Promise<SharedBriefDto> {
  const res = await post("/shared/brief", token, code);
  return ((await res.json()) as { data: SharedBriefDto }).data;
}

export async function downloadSharedBriefPdf(token: string, code: string): Promise<Blob> {
  const res = await post("/shared/brief/pdf", token, code);
  return res.blob();
}

/** The token is the URL fragment: `/shared#<token>`. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return token.length >= 20 ? token : null;
}
