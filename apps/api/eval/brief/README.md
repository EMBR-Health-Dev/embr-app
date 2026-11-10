# BRIEF evaluation harness

Checks the BRIEF's optional AI wording against 15 fictional records,
with the same code production uses. No real patient data, ever.

## What it checks

| Check              | How                                                                           | Production code? |
| ------------------ | ----------------------------------------------------------------------------- | ---------------- |
| Output schema      | `parseBriefResponse` (JSON and shape)                                         | Yes              |
| Prohibited terms   | `parseBriefResponse` content safety deny-list (EN, FR, JA)                    | Yes              |
| Citation integrity | Topic citations in `parseBriefResponse`, patterns in `validateStage4Patterns` | Yes              |
| Truncation         | `stop_reason` is `max_tokens`                                                 | Same signal      |
| Language           | Script share for Japanese; English versus French function words               | Eval only        |
| Length             | Narrative and topic length, per language (`EVAL_LIMITS` in `checks.ts`)       | Eval only        |
| Latency and tokens | Measured per call in live mode; budget in `EVAL_LIMITS`                       | Eval only        |

The eval only thresholds are product heuristics for review, not
clinical rules.

## The records

`records.ts`: sparse, complete, contradictory, missing data, edge cases
(co-occurrence exactly at and one day below its threshold, unchanged
counts, every category, a treatment too recent for its window) and
insufficient evidence, in English, French and Japanese. `pipeline.ts`
turns each into the AI input with production's deterministic functions.

## Running it

Replay (offline, deterministic, no key; CI runs this through
`test/brief-eval.test.ts`):

```sh
pnpm --filter @embr/api eval:brief
```

It scores SYNTHETIC responses written by the harness (`synthetic.ts`):
for each record, one faithful response that must pass every check and
five that each break one rule (an invented citation, prohibited
language, the wrong language, truncation, excess length) and must be
caught. It writes `reports/replay.md` and `.json`, byte-identical on
every run; CI fails if the committed report drifts.

Live (calls the configured model; needs `ANTHROPIC_API_KEY`; costs a
few cents; run by a person, never in CI):

```sh
ANTHROPIC_API_KEY=... pnpm --filter @embr/api eval:brief -- --live
```

It sends each record exactly as production would (`buildBriefRequest`)
and writes `reports/live-<time>.md` and `.json`, including the
responses, for a clinician to score. Run it after any change to the
prompt, the model or the deny-list, and attach the report to the PR.
