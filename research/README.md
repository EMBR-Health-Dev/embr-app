# EMBR Research Sandbox

A research/architecture prototype, not product code. It exists to answer
one question: **can EMBR's longitudinal evidence model represent real
dense-sampling, multimodal research data without collapsing it into a
single score?** If it can, that's evidence the underlying architecture
generalizes beyond symptom logging. It is not, and must never become,
training data or a source of clinical claims for the consumer product.

## Scope (v0.1)

- **In scope:** `research/fixtures/28andme/participants.tsv` — the
  behavioral/mood measures (POMS, PSQI, STAI, Perceived Stress Scale,
  caloric intake) from the [28andMe dataset](https://openneuro.org/datasets/ds002674)
  (OpenNeuro accession `ds002674`, CC0), 60 daily sessions from one
  participant.
- **Explicitly out of scope for v0.1:**
  - **MRI volumes.** The dataset's structural/functional scans are
    DataLad/git-annex-backed and many GB per subject. This sandbox
    represents each session's MRI acquisition as a `pointerOnly: true`
    observation (see `schemas/longitudinal-observation.ts`) — the
    timeline stays complete without downloading any imaging data.
  - **Hormone/endocrine values.** These are _not_ published in the
    OpenNeuro BIDS repository itself (only `anat`/`func`/`fmap` imaging
    folders and the behavioral `participants.tsv`). The actual serum
    hormone concentrations live in the paper's supplementary tables
    (Pritschet et al., _NeuroImage_ 2020,
    [doi:10.1016/j.neuroimage.2020.117091](https://doi.org/10.1016/j.neuroimage.2020.117091)),
    which sit under the publisher's copyright terms, not the dataset's
    CC0 license. Getting that data legitimately means transcribing from
    the paper or contacting the Jacobs Lab directly — a partnership
    step, not something this pipeline does automatically.

## License and attribution

28andMe is released under **CC0** (`dataset_description.json`:
`"License": "CC0"`) — unrestricted reuse. The dataset's own
`HowToAcknowledge` field asks that reuse cite:

> Pritschet, L., et al. (2020). Functional reorganization of brain
> networks across the human menstrual cycle. _NeuroImage_, 220, 117091.
> https://doi.org/10.1016/j.neuroimage.2020.117091

That's not a CC0 legal requirement, but it costs nothing to honor and
this file does.

## Why this isn't in `apps/` or `packages/`

This directory is **not** part of the pnpm workspace
(`pnpm-workspace.yaml` only globs `apps/*` and `packages/*`), is not
built, linted, or tested by any CI job, and imports nothing from — and
is imported by nothing in — the production app. `research/fixtures/` is
gitignored: the third-party dataset itself is never committed to this
repository's history, only the pipeline/schema code that maps it.

This sandbox never touches production user data, the Dashboard, the
Anthropic credential, or Clinical Brief generation.

## Running it

```bash
# 1. Get the source file (not committed — see .gitignore)
mkdir -p research/fixtures/28andme
curl -o research/fixtures/28andme/participants.tsv \
  https://raw.githubusercontent.com/OpenNeuroDatasets/ds002674/master/participants.tsv

# 2. Map it into the canonical longitudinal-observation shape
node research/pipelines/ingest-28andme.mjs

# 3. Ask the actual research question: what changed, when, and what
#    else was recorded at the same session — literal deltas only, no
#    causal or clinical interpretation.
node research/analyses/within-person-variation.mjs
```

## What this is not

- Not training data for any consumer-facing EMBR model.
- Not a source of menopause biology claims — the 28andMe participant is
  a 23-year-old naturally-cycling (then hormonal-contraceptive) female,
  not a menopause population.
- Not a generic ontology. `schemas/longitudinal-observation.ts` is
  deliberately small and mirrors the provenance discipline of
  `packages/types`' `Stage4Pattern` (deterministic id, bounded
  observation, explicit source pointer) without reusing its
  EMBR-specific unions, which don't apply to third-party research data.
