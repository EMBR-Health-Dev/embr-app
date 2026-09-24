/**
 * Canonical longitudinal observation record for the EMBR Research Sandbox.
 *
 * This mirrors the provenance discipline of Stage4Pattern in
 * packages/types/src/index.ts — a deterministic id, a bounded
 * observation value, and an explicit pointer back to source — without
 * reusing its EMBR-specific unions (SymptomCategory, treatmentId), which
 * don't apply to third-party research datasets. It is intentionally not
 * imported by any app or package: see research/README.md for why this
 * directory is isolated from the product build.
 *
 * One record = one measured (or pointer-only) value for one subject, in
 * one session, in one domain. A study session that produced an MRI scan
 * this sandbox did not download is still represented as a record — with
 * pointerOnly: true and value: null — so a subject's timeline stays
 * complete without pulling in the underlying imaging data.
 */
export interface LongitudinalObservation {
  /** Deterministic: `${datasetId}:${subjectId}:${sessionId}:${domain}:${measure}` */
  id: string;
  datasetId: string;
  subjectId: string;
  sessionId: string;
  /** Position in the study timeline (session order), not a calendar
   * date — these datasets de-identify absolute dates. */
  sessionIndex: number;
  domain: "mood" | "sleep" | "stress" | "physiology" | "imaging" | "endocrine";
  measure: string;
  /** The measured value, or null for a pointer-only record. */
  value: number | null;
  unit: string | null;
  /** The source dataset's own column/variable name, kept alongside the
   * canonical domain/measure so the mapping stays auditable. */
  sourceVariable: string | null;
  instrument: string | null;
  /** True when this domain/session is known to exist in the source
   * dataset but was not ingested here (e.g. MRI volumes). */
  pointerOnly: boolean;
  provenance: {
    datasetDoi: string;
    datasetLicense: "CC0";
    sourceFile: string;
    ingestedAt: string;
  };
}
