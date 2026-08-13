import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_BASE_URL } from "./api-client";
import { tokenStorage } from "./token-storage";

/**
 * Unlike apps/web (a plain <a href> the browser handles natively via
 * cookies + the same-origin proxy), mobile has no browser download
 * mechanism and no cookie — the PDF has to be fetched with an explicit
 * Bearer header, written to local storage, then handed to the native
 * share sheet so the person can actually save or send it somewhere.
 *
 * Deliberately not routed through apiFetch() in api-client.ts — that
 * function always parses the response as JSON, which a binary PDF
 * isn't, and File.downloadFileAsync already handles streaming an
 * authenticated response straight to disk in one call rather than
 * buffering the whole file into memory first.
 */
export async function downloadAndShareBriefPdf(id: string): Promise<void> {
  const stored = await tokenStorage.get();
  if (!stored) {
    throw new Error("Not signed in");
  }

  const dir = new Directory(Paths.cache, "briefs");
  if (!dir.exists) dir.create();

  const output = await File.downloadFileAsync(`${API_BASE_URL}/briefs/${id}/pdf`, dir, {
    headers: { Authorization: `Bearer ${stored.accessToken}` },
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    // Nothing more to do on a platform/simulator without a share sheet
    // — the file is still on disk at output.uri for whatever else
    // might use it.
    return;
  }

  await Sharing.shareAsync(output.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
