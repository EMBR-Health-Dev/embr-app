import type { Stage4EvidenceRef, Stage4Pattern } from "./stage4-interpretation.js";

/**
 * Citation integrity check, run after briefAi.generate() and before
 * persistence. This is the enforcement point for the core invariant
 * established during the AI safety architecture inspection: the AI
 * may describe a relationship only when it corresponds to a pattern
 * this module's deterministic Stage 4 layer actually produced. A
 * citation proves a legitimate evidence source was available — it
 * does not prove the AI's prose faithfully represents it. Those are
 * kept as separate concerns on purpose (see brief.ai.ts's own doc
 * comment on this same distinction); this function only ever checks
 * provenance (id, type, evidenceRef), never generated text.
 *
 * On success, returns the *canonical* patterns — looked up from
 * `expectedPatterns` by the now-validated ids, never the caller's own
 * `returnedPatterns` objects. This is the actual hardening a lead-dev
 * review of this file flagged: id/type/evidenceRef being checked
 * doesn't, on its own, stop a caller from later reading
 * `returned.observation`/`.interpretation`/`.caveat` — fields this
 * function deliberately never inspects — straight off the AI's own
 * response object. No current caller does that today (verified
 * directly: brief.service.ts only ever reads `.id` off the AI's
 * returned patterns, and every display path resolves cited ids back
 * against the canonical `interpretation.patterns` for its actual
 * text), but that safety currently depends on every future caller
 * independently getting that right, not on anything this function
 * itself enforces. Returning the canonical objects here means a
 * caller that later did read `.observation` off this function's
 * result would get the trusted, deterministic text by construction,
 * not the AI's own, unchecked copy of it.
 *
 * Deliberately does NOT compare observation/association/interpretation/
 * caveat for exact equality, even though brief.ai.ts's system prompt
 * asks the model to echo that text verbatim. That's a prompted
 * expectation, not something a citation-integrity check needs to
 * force: the id/type/evidenceRef triple is what proves "this really
 * is the deterministic finding," and the residual gap (a model could
 * still misstate the supplied text *in its narrative/discussion
 * topics*, which this function never sees or governs) is the
 * explicitly accepted limitation from the safety inspection — the
 * causal-language backstop in failsContentSafety covers that risk,
 * not this function.
 *
 * Deliberately does NOT require the returned pattern set to equal the
 * expected set. brief.ai.ts's system prompt (rules 6-7) explicitly
 * tells the model to include only the patterns it actually referenced
 * in the narrative or discussion topics, and to return an empty array
 * if none are relevant — a real, intentional subset, not a defect. A
 * missing deterministic pattern in the response is not a validation
 * failure; every *returned* pattern must still resolve to a real,
 * unaltered deterministic one.
 */
export function validateStage4Patterns(
  expectedPatterns: Stage4Pattern[],
  returnedPatterns: Stage4Pattern[],
): { error: string; patterns?: undefined } | { error: null; patterns: Stage4Pattern[] } {
  const expectedById = new Map(expectedPatterns.map((pattern) => [pattern.id, pattern]));
  const seenIds = new Set<string>();
  const canonical: Stage4Pattern[] = [];

  for (const returned of returnedPatterns) {
    if (seenIds.has(returned.id)) {
      return { error: `AI response returned the same pattern id more than once: "${returned.id}"` };
    }
    seenIds.add(returned.id);

    const expected = expectedById.get(returned.id);
    if (!expected) {
      return {
        error: `AI response referenced a pattern id that was never supplied: "${returned.id}"`,
      };
    }

    if (returned.type !== expected.type) {
      return {
        error:
          `AI response changed the type of pattern "${returned.id}" from ` +
          `"${expected.type}" to "${returned.type}"`,
      };
    }

    if (!evidenceRefsMatch(expected.evidenceRef, returned.evidenceRef)) {
      return { error: `AI response changed the evidenceRef of pattern "${returned.id}"` };
    }

    canonical.push(expected);
  }

  return { error: null, patterns: canonical };
}

/**
 * Structural, not string, comparison — deliberately not
 * JSON.stringify(a) === JSON.stringify(b). JSON key order isn't part
 * of an object's semantic identity, and a model re-serializing an
 * evidenceRef isn't guaranteed to preserve the exact key order this
 * codebase happens to construct it in (e.g. {categoryB, categoryA}
 * means the same thing as {categoryA, categoryB} but would produce a
 * different string), which would make a naive string comparison
 * reject a legitimate, unaltered evidenceRef.
 */
function evidenceRefsMatch(a: Stage4EvidenceRef, b: Stage4EvidenceRef): boolean {
  if ("category" in a && "category" in b) {
    return a.category === b.category;
  }
  if ("categoryA" in a && "categoryA" in b) {
    return a.categoryA === b.categoryA && a.categoryB === b.categoryB;
  }
  if ("treatmentId" in a && "treatmentId" in b) {
    return a.treatmentId === b.treatmentId;
  }
  return false; // different evidenceRef shapes entirely — never a match
}
