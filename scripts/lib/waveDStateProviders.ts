import { createHash } from "node:crypto";
import {
  WAVE_D_STATES,
  normalizeWaveDEvidence,
  type WaveDState,
  type WaveDEvidence,
  type WaveDStatus,
} from "./waveDSourceResolution.js";

type Json = Record<string, unknown>;
type SourceRecord = {
  sourceId: string;
  kind: "candidateList" | "governorRace" | "statewideMeasure";
  name: string;
  party?: string;
  office?: string;
  district?: string;
  qualificationPhase: "filed" | "primary" | "general_list" | "certified";
  pickEligibility: "ineligible";
  canonicalFecId?: string;
  mapping: "not_attempted" | "unresolved" | "deterministic";
  eligibleOptions?: string[];
};
export type WaveDProviderFixture = {
  schemaVersion: 1;
  state: WaveDState;
  evidenceDigest: string;
  sourceUrl: string;
  sourcePhase: SourceRecord["qualificationPhase"];
  status: WaveDStatus;
  retrievedAt: string;
  reviewedAt: string;
  sourceMarkers: string[];
  records: SourceRecord[];
};
export type WaveDProviderResult = {
  state: WaveDState;
  mode: "fixture" | "reviewed-manual" | "blocked";
  status: WaveDStatus | "schema_drift";
  nextReviewAt: string;
  evidenceDigest: string;
  source?: {
    url: string;
    phase: SourceRecord["qualificationPhase"];
    status: WaveDStatus;
    retrievedAt: string;
    reviewedAt: string;
    markers: string[];
  };
  records: SourceRecord[];
  capabilities: string[];
  blockers: string[];
  diagnostics: string[];
};
export type WaveDProviderReport = {
  operation: "offline-wave-d-state-provider-audit";
  inputDigest: string;
  evidenceDigest: string;
  planDigest: string;
  states: Record<WaveDState, WaveDProviderResult>;
  counts: {
    states: number;
    fixtureBacked: number;
    manualOrBlocked: number;
    status: Record<WaveDStatus | "schema_drift", number>;
    capability: Record<
      "candidateList" | "governorRace" | "statewideMeasure",
      number
    >;
    records: number;
    mappings: { deterministic: number; unresolved: number };
    acceptedAmbiguousIdentities: number;
    duplicateCanonicalIds: number;
    invalidEligibleChoices: number;
    schemaDrift: number;
    blockers: number;
  };
};
const object = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const iso = (value: unknown) =>
  !!text(value) && !Number.isNaN(Date.parse(text(value)));
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : object(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value
        .map(stable)
        .sort((left, right) => canonical(left).localeCompare(canonical(right)))
    : object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;

function record(value: unknown, state: WaveDState): SourceRecord {
  if (!object(value)) throw Error(`invalid provider record: ${state}`);
  const result: SourceRecord = {
    sourceId: text(value.sourceId),
    kind: text(value.kind) as SourceRecord["kind"],
    name: text(value.name),
    ...(text(value.party) ? { party: text(value.party) } : {}),
    ...(text(value.office) ? { office: text(value.office) } : {}),
    ...(text(value.district) ? { district: text(value.district) } : {}),
    qualificationPhase: text(
      value.qualificationPhase,
    ) as SourceRecord["qualificationPhase"],
    pickEligibility: text(value.pickEligibility) as "ineligible",
    ...(text(value.canonicalFecId)
      ? { canonicalFecId: text(value.canonicalFecId) }
      : {}),
    mapping: text(value.mapping) as SourceRecord["mapping"],
    ...(Array.isArray(value.eligibleOptions)
      ? { eligibleOptions: value.eligibleOptions.map(text) }
      : {}),
  };
  if (
    !result.sourceId ||
    !["candidateList", "governorRace", "statewideMeasure"].includes(
      result.kind,
    ) ||
    !result.name ||
    !["filed", "primary", "general_list", "certified"].includes(
      result.qualificationPhase,
    ) ||
    result.pickEligibility !== "ineligible" ||
    !["not_attempted", "unresolved", "deterministic"].includes(
      result.mapping,
    ) ||
    (result.mapping === "deterministic" && !result.canonicalFecId) ||
    (result.eligibleOptions &&
      (!result.eligibleOptions.length ||
        new Set(result.eligibleOptions).size !==
          result.eligibleOptions.length ||
        result.qualificationPhase !== "certified"))
  )
    throw Error(`invalid provider record: ${state}`);
  return result;
}
function fixture(
  value: unknown,
  evidence: WaveDEvidence,
): WaveDProviderFixture {
  if (!object(value)) throw Error(`missing fixture: ${evidence.state}`);
  const valueRecords = Array.isArray(value.records)
    ? value.records
        .map((item) => record(item, evidence.state))
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    : [];
  const result: WaveDProviderFixture = {
    schemaVersion: value.schemaVersion as 1,
    state: text(value.state) as WaveDState,
    evidenceDigest: text(value.evidenceDigest),
    sourceUrl: text(value.sourceUrl),
    sourcePhase: text(value.sourcePhase) as SourceRecord["qualificationPhase"],
    status: text(value.status) as WaveDStatus,
    retrievedAt: text(value.retrievedAt),
    reviewedAt: text(value.reviewedAt),
    sourceMarkers: Array.isArray(value.sourceMarkers)
      ? value.sourceMarkers.map(text).filter(Boolean).sort()
      : [],
    records: valueRecords,
  };
  if (
    result.schemaVersion !== 1 ||
    result.state !== evidence.state ||
    result.evidenceDigest !== evidence.evidenceDigest ||
    !evidence.capabilities.some(
      (cap) => cap.proven && cap.endpoint === result.sourceUrl,
    ) ||
    !["filed", "primary", "general_list", "certified"].includes(
      result.sourcePhase,
    ) ||
    ![
      "available",
      "preliminary",
      "not_yet_published",
      "access_blocked",
      "unresolved",
    ].includes(result.status) ||
    !iso(result.retrievedAt) ||
    !iso(result.reviewedAt) ||
    !result.sourceMarkers.length
  )
    throw Error(`invalid fixture/digest: ${evidence.state}`);
  if (
    new Set(result.records.map((item) => item.sourceId)).size !==
    result.records.length
  )
    throw Error(`duplicate provider record: ${evidence.state}`);
  return result;
}
export function buildWaveDProviderReport(
  input: Record<WaveDState, unknown>,
  fixtures: Record<string, unknown>,
): WaveDProviderReport {
  const states = {} as Record<WaveDState, WaveDProviderResult>;
  const status = {
    available: 0,
    preliminary: 0,
    not_yet_published: 0,
    officially_none: 0,
    access_blocked: 0,
    unresolved: 0,
    schema_drift: 0,
  };
  const capability = { candidateList: 0, governorRace: 0, statewideMeasure: 0 };
  let fixtureBacked = 0,
    records = 0,
    deterministic = 0,
    unresolved = 0,
    duplicates = 0,
    invalidEligibleChoices = 0,
    blockers = 0,
    schemaDrift = 0;
  const seen = new Set<string>();
  for (const state of WAVE_D_STATES) {
    const evidence = normalizeWaveDEvidence(input[state]);
    const raw = fixtures[state];
    if (raw) {
      try {
        const parsed = fixture(raw, evidence);
        fixtureBacked++;
        parsed.records.forEach((item) => {
          records++;
          if (seen.has(item.sourceId)) duplicates++;
          seen.add(item.sourceId);
          if (item.mapping === "deterministic") deterministic++;
          if (item.mapping === "unresolved") unresolved++;
          if (item.eligibleOptions && item.pickEligibility !== "ineligible")
            invalidEligibleChoices++;
        });
        evidence.capabilities
          .filter((item) => item.proven)
          .forEach((item) => capability[item.capability]++);
        states[state] = {
          state,
          mode: "fixture",
          status: parsed.status,
          nextReviewAt: evidence.nextReviewAt,
          evidenceDigest: evidence.evidenceDigest,
          source: {
            url: parsed.sourceUrl,
            phase: parsed.sourcePhase,
            status: parsed.status,
            retrievedAt: parsed.retrievedAt,
            reviewedAt: parsed.reviewedAt,
            markers: parsed.sourceMarkers,
          },
          records: parsed.records,
          capabilities: evidence.capabilities
            .filter((item) => item.proven)
            .map((item) => item.capability),
          blockers: evidence.capabilities
            .filter((item) => !item.proven)
            .map((item) => item.reviewerNotes[0]),
          diagnostics: [],
        };
      } catch (error) {
        schemaDrift++;
        states[state] = {
          state,
          mode: "fixture",
          status: "schema_drift",
          nextReviewAt: evidence.nextReviewAt,
          evidenceDigest: evidence.evidenceDigest,
          records: [],
          capabilities: [],
          blockers: [error instanceof Error ? error.message : String(error)],
          diagnostics: ["fixture_failure_isolated"],
        };
        blockers++;
      }
    } else {
      const blocked =
        evidence.publicationStatus === "access_blocked" ||
        evidence.publicationStatus === "unresolved";
      states[state] = {
        state,
        mode: blocked ? "blocked" : "reviewed-manual",
        status: evidence.publicationStatus,
        nextReviewAt: evidence.nextReviewAt,
        evidenceDigest: evidence.evidenceDigest,
        records: [],
        capabilities: [],
        blockers: evidence.capabilities
          .filter((item) => !item.proven)
          .map((item) => item.reviewerNotes[0]),
        diagnostics: ["manual_provider_no_unsupported_records"],
      };
      blockers += states[state].blockers.length;
    }
    status[states[state].status]++;
  }
  const evidenceDigest = digest(
    Object.fromEntries(
      WAVE_D_STATES.map((state) => [state, states[state].evidenceDigest]),
    ),
  );
  const counts = {
    states: 36,
    fixtureBacked,
    manualOrBlocked: 36 - fixtureBacked,
    status,
    capability,
    records,
    mappings: { deterministic, unresolved },
    acceptedAmbiguousIdentities: 0,
    duplicateCanonicalIds: duplicates,
    invalidEligibleChoices,
    schemaDrift,
    blockers,
  };
  return {
    operation: "offline-wave-d-state-provider-audit",
    inputDigest: digest(stable({ input, fixtures })),
    evidenceDigest,
    planDigest: digest({ states, counts }),
    states,
    counts,
  };
}
