#!/usr/bin/env node
// Answers the sandbox's actual research question: can a canonical
// longitudinal-observation timeline represent "what changed, when, and
// what else was recorded at the same time" without collapsing everything
// into a single score? This script only reports literal deltas between
// consecutive sessions per measure — no causal or clinical interpretation,
// consistent with EMBR's evidence-architecture doctrine.
//
// Usage: node research/analyses/within-person-variation.mjs [observationsPath]

import { readFileSync } from "node:fs";

function loadObservations(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function groupByMeasure(observations) {
  const groups = new Map();
  for (const obs of observations) {
    if (obs.value === null) continue;
    const key = `${obs.domain}.${obs.measure}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(obs);
  }
  for (const series of groups.values()) {
    series.sort((a, b) => a.sessionIndex - b.sessionIndex);
  }
  return groups;
}

function largestDeltas(series, topN = 3) {
  const deltas = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    deltas.push({
      fromSession: prev.sessionId,
      toSession: curr.sessionId,
      fromValue: prev.value,
      toValue: curr.value,
      delta: curr.value - prev.value,
    });
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, topN);
}

function coObservedAt(observations, sessionId, excludeMeasure) {
  return observations
    .filter((o) => o.sessionId === sessionId && `${o.domain}.${o.measure}` !== excludeMeasure)
    .filter((o) => o.value !== null)
    .map((o) => `${o.domain}.${o.measure}=${o.value}`);
}

function main() {
  const path = process.argv[2] ?? "research/fixtures/28andme/observations.json";
  const observations = loadObservations(path);
  const groups = groupByMeasure(observations);

  console.log(`Loaded ${observations.length} observations across ${groups.size} measures\n`);

  for (const [measureKey, series] of groups) {
    const top = largestDeltas(series);
    if (top.length === 0) continue;
    console.log(`## ${measureKey} (${series.length} sessions)`);
    for (const d of top) {
      const co = coObservedAt(observations, d.toSession, measureKey);
      console.log(
        `  ${d.fromSession} -> ${d.toSession}: ${d.fromValue} -> ${d.toValue} (delta ${d.delta > 0 ? "+" : ""}${d.delta})`,
      );
      if (co.length > 0) {
        console.log(`    co-observed at ${d.toSession}: ${co.join(", ")}`);
      }
    }
    console.log("");
  }
}

main();
