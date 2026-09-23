#!/usr/bin/env node
// Maps 28andMe's participants.tsv (OpenNeuro ds002674, CC0) into
// research/schemas/longitudinal-observation.ts's canonical shape.
//
// Local-file only — does not fetch over the network, so it has a
// predictable footprint regardless of environment/proxy setup. To
// (re-)obtain the source file:
//
//   mkdir -p research/fixtures/28andme
//   curl -o research/fixtures/28andme/participants.tsv \
//     https://raw.githubusercontent.com/OpenNeuroDatasets/ds002674/master/participants.tsv
//
// Usage: node research/pipelines/ingest-28andme.mjs [inputPath] [outputPath]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DATASET_ID = "openneuro:ds002674";
const DATASET_DOI = "10.18112/openneuro.ds002674.v1.0.5";
const SOURCE_FILE = "participants.tsv";

// source_variable -> [domain, measure, unit, instrument]
const VARIABLE_MAP = {
  poms_tension: ["mood", "tension", "POMS subscale score", "POMS"],
  poms_depression: ["mood", "depression", "POMS subscale score", "POMS"],
  poms_anger: ["mood", "anger", "POMS subscale score", "POMS"],
  poms_vigor: ["mood", "vigor", "POMS subscale score", "POMS"],
  poms_fatigue: ["mood", "fatigue", "POMS subscale score", "POMS"],
  poms_confusion: ["mood", "confusion", "POMS subscale score", "POMS"],
  psqi: ["sleep", "sleep_quality", "PSQI global score", "PSQI"],
  state_anxiety: ["mood", "state_anxiety", "STAI score", "STAI"],
  perceived_stress: ["stress", "perceived_stress", "PSS score", "PSS"],
  total_calorie_intake: ["physiology", "calorie_intake", "kcal", null],
};

function parseTsv(text) {
  const [header, ...rows] = text.trim().split("\n");
  const columns = header.split("\t");
  return rows.map((row) => {
    const cells = row.split("\t");
    return Object.fromEntries(columns.map((c, i) => [c, cells[i]]));
  });
}

function toObservations(rows, ingestedAt) {
  const observations = [];

  for (const row of rows) {
    const subjectId = row.participant_id;
    const sessionId = row.session_id;
    const sessionIndex = Number(sessionId.replace(/\D/g, ""));

    for (const [sourceVariable, [domain, measure, unit, instrument]] of Object.entries(
      VARIABLE_MAP,
    )) {
      const raw = row[sourceVariable];
      const numeric = raw === undefined || raw === "n/a" ? null : Number(raw);
      const value = numeric !== null && Number.isFinite(numeric) ? numeric : null;

      observations.push({
        id: `${DATASET_ID}:${subjectId}:${sessionId}:${domain}:${measure}`,
        datasetId: DATASET_ID,
        subjectId,
        sessionId,
        sessionIndex,
        domain,
        measure,
        value,
        unit,
        sourceVariable,
        instrument,
        pointerOnly: value === null,
        provenance: {
          datasetDoi: DATASET_DOI,
          datasetLicense: "CC0",
          sourceFile: SOURCE_FILE,
          ingestedAt,
        },
      });
    }

    // Every session also included a structural + functional MRI
    // acquisition that this sandbox does not download (see
    // research/README.md) — recorded as a pointer-only observation so
    // the timeline stays complete without pulling gigabytes of NIfTI
    // volumes into a schema test.
    observations.push({
      id: `${DATASET_ID}:${subjectId}:${sessionId}:imaging:mri_session`,
      datasetId: DATASET_ID,
      subjectId,
      sessionId,
      sessionIndex,
      domain: "imaging",
      measure: "mri_session",
      value: null,
      unit: null,
      sourceVariable: null,
      instrument: "Siemens 3T Prisma",
      pointerOnly: true,
      provenance: {
        datasetDoi: DATASET_DOI,
        datasetLicense: "CC0",
        sourceFile: `${subjectId}/${sessionId}/{anat,func,fmap}`,
        ingestedAt,
      },
    });
  }

  return observations;
}

function main() {
  const inputPath = process.argv[2] ?? "research/fixtures/28andme/participants.tsv";
  const outputPath = process.argv[3] ?? "research/fixtures/28andme/observations.json";

  const text = readFileSync(inputPath, "utf8");
  const rows = parseTsv(text);
  const observations = toObservations(rows, new Date().toISOString());

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(observations, null, 2));

  console.log(`Ingested ${rows.length} sessions -> ${observations.length} observations`);
  console.log(`Written to ${outputPath}`);
}

main();
