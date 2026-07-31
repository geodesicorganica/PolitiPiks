import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WAVE_D_STATES } from "./waveDSourceResolution.js";
import { buildWaveDProviderReport } from "./waveDStateProviders.js";

const evidence = Object.fromEntries(
  WAVE_D_STATES.map((state) => [
    state,
    JSON.parse(readFileSync(`data/2026/wave-d-reviewed/${state}.json`, "utf8")),
  ]),
) as Record<(typeof WAVE_D_STATES)[number], unknown>;
const fixtures = Object.fromEntries(
  ["AL", "IL", "IA", "MD", "ME", "SD"].map((state) => [
    state,
    JSON.parse(
      readFileSync(`data/2026/wave-d-providers/${state}.json`, "utf8"),
    ),
  ]),
);
process.env.FIREBASE_CONFIG = "deliberately-invalid-for-offline-provider-test";
const report = buildWaveDProviderReport(evidence, fixtures);
assert.equal(report.counts.states, 36);
assert.equal(report.counts.fixtureBacked, 6);
assert.equal(report.counts.manualOrBlocked, 30);
assert.equal(report.counts.capability.statewideMeasure, 3);
assert.equal(report.counts.records, 6);
assert.equal(report.counts.acceptedAmbiguousIdentities, 0);
assert.equal(report.counts.duplicateCanonicalIds, 0);
assert.equal(report.counts.invalidEligibleChoices, 0);
assert.equal(
  buildWaveDProviderReport(
    Object.fromEntries(Object.entries(evidence).reverse()) as typeof evidence,
    fixtures,
  ).planDigest,
  report.planDigest,
);
assert.equal(report.states.MD.records[0].pickEligibility, "ineligible");
assert.equal(report.states.AR.records.length, 0);
for (const state of ["AR", "CO", "HI", "ID", "NV", "PA", "TN", "WI"] as const) {
  assert.equal(report.states[state].mode, "blocked");
  assert.equal(report.states[state].records.length, 0);
}
assert.equal(report.states.SD.records.length, 4);
assert.ok(
  report.states.SD.records.every(
    (entry) => entry.pickEligibility === "ineligible",
  ),
);
assert.equal(
  report.states.SD.source?.url,
  "https://sdsos.gov/elections-voting/upcoming-elections/general-information/2026%20Election%20Information/2026-ballot-questions.aspx",
);
const shuffled = buildWaveDProviderReport(
  Object.fromEntries(Object.entries(evidence).reverse()) as typeof evidence,
  {
    ...fixtures,
    SD: {
      ...fixtures.SD,
      sourceMarkers: [...fixtures.SD.sourceMarkers].reverse(),
      records: [...fixtures.SD.records].reverse(),
    },
  },
);
assert.equal(shuffled.inputDigest, report.inputDigest);
assert.equal(shuffled.planDigest, report.planDigest);
const changedInput = buildWaveDProviderReport(evidence, {
  ...fixtures,
  SD: {
    ...fixtures.SD,
    records: [
      { ...fixtures.SD.records[0], name: "Changed official title" },
      ...fixtures.SD.records.slice(1),
    ],
  },
});
assert.notEqual(changedInput.inputDigest, report.inputDigest);
assert.notEqual(changedInput.planDigest, report.planDigest);
const changedPlan = buildWaveDProviderReport(evidence, {
  ...fixtures,
  SD: { ...fixtures.SD, status: "preliminary" },
});
assert.notEqual(changedPlan.planDigest, report.planDigest);
const drifted = buildWaveDProviderReport(evidence, {
  ...fixtures,
  MD: { ...fixtures.MD, evidenceDigest: "0".repeat(64) },
});
assert.equal(drifted.states.MD.status, "schema_drift");
assert.equal(drifted.states.AL.status, "preliminary");
assert.equal(
  buildWaveDProviderReport(evidence, {
    ...fixtures,
    MD: {
      ...fixtures.MD,
      records: [fixtures.MD.records[0], { ...fixtures.MD.records[0] }],
    },
  }).states.MD.status,
  "schema_drift",
);
assert.equal(
  buildWaveDProviderReport(evidence, {
    ...fixtures,
    SD: { ...fixtures.SD, sourcePhase: "not-a-phase" },
  }).states.SD.status,
  "schema_drift",
);
assert.equal(
  buildWaveDProviderReport(evidence, {
    ...fixtures,
    MD: {
      ...fixtures.MD,
      records: [{ ...fixtures.MD.records[0], mapping: "unresolved" }],
    },
  }).counts.mappings.unresolved,
  1,
);
assert.equal(
  buildWaveDProviderReport(evidence, {
    ...fixtures,
    MD: {
      ...fixtures.MD,
      records: [{ ...fixtures.MD.records[0], pickEligibility: "eligible" }],
    },
  }).states.MD.status,
  "schema_drift",
);
assert.equal(
  /from\s+["'][^"']*firebase/.test(
    readFileSync("scripts/audit-2026-wave-d-state-providers.ts", "utf8"),
  ),
  false,
);
console.log("Wave D state provider tests passed");
