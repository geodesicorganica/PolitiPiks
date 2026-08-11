import { encodeFirestoreSnapshotValue } from './canonicalMigration.js';
import { sameG8V2ActivationData, type G8V2ActivationPlan } from './g8V2Activation.js';
import { localProductDigest, validateLocalProductBundle, type LocalProductBundle } from './localProductBundle.js';

type Json = Record<string, unknown>;
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

export const G8_V2_CONFLICT_SNAPSHOT_CONTRACT = 'g8-4br5a-conflict-snapshot/v1' as const;
export const G8_V2_CONFLICT_ANALYSIS_CONTRACT = 'g8-4br5a-conflict-analysis/v1' as const;
export const G8_V2_CONFLICT_PLAN_CONTRACT = 'g8-4br5a-conflict-resolution-plan/v1' as const;

export type G8V2ConflictFamily = 'races' | 'measures' | 'candidateResearch' | 'measureResearch' | 'metrics';
export type G8V2PathClassification = 'exact' | 'missing' | 'conflicting' | 'unknown';
export type G8V2DifferenceKind = 'production-only' | 'expected-only' | 'changed';
export type G8V2ConflictClassification = 'exact-after-safe-normalization' | 'metadata-only' | 'substantive' | 'unknown';
export type G8V2ResolutionDisposition = 'preserve-and-replace' | 'approved-merge' | 'retain-existing' | 'retire' | 'unresolved';

export type G8V2JsonPointerDifference = {
  pointer: string;
  kind: G8V2DifferenceKind;
  actualType: string;
  expectedType: string;
  actualValueDigest: string | null;
  expectedValueDigest: string | null;
};

export type G8V2ConflictObservation = {
  path: string;
  actual: Json | null;
  errorCode?: string;
};

export type G8V2ConflictCaptureIdentity = {
  capturedAt: string;
  captureReceipt: string;
  projectId: string;
  databaseId: string;
  generation: string;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  conflictAnalysisImplementationCommit: string;
};

export type G8V2ConflictDocument = {
  path: string;
  family: G8V2ConflictFamily;
  actual: Json;
  expected: Json;
  actualDigest: string;
  expectedDigest: string;
  differences: G8V2JsonPointerDifference[];
  productionOnlyPointers: string[];
};

export type G8V2ConflictAssessment = {
  path: string;
  family: G8V2ConflictFamily;
  classification: G8V2ConflictClassification;
  metadataAllowlistVersion: 'g8-4br5a-activation-envelope/v1';
  protectedPointers: string[];
  productionOnlyPointers: string[];
  safeToReplace: boolean;
  originInference: 'likely-g8-4b-remnant' | 'legacy-active' | 'neither' | 'indeterminate';
  inferenceBasis: string;
};

export type G8V2ConflictSnapshot = {
  schemaVersion: 1;
  contract: typeof G8_V2_CONFLICT_SNAPSHOT_CONTRACT;
  capture: G8V2ConflictCaptureIdentity;
  selector: {
    path: 'catalogActivations/canonical-2026';
    status: 'present' | 'absent' | 'unknown';
    actual: Json | null;
    actualDigest: string | null;
    errorCode: string | null;
  };
  inventory: Array<{
    path: string;
    family: G8V2ConflictFamily;
    expectedDigest: string;
    classification: G8V2PathClassification;
    actualDigest: string | null;
    differenceCount: number;
  }>;
  conflicts: G8V2ConflictDocument[];
  unknown: Array<{ path: string; family: G8V2ConflictFamily; errorCode: string }>;
  counts: {
    expected: number;
    exact: number;
    missing: number;
    conflicting: number;
    unknown: number;
    families: Record<G8V2ConflictFamily, { expected: number; exact: number; missing: number; conflicting: number; unknown: number }>;
  };
  summaries: {
    byPointer: Array<{ pointer: string; documents: number; productionOnly: number; expectedOnly: number; changed: number }>;
    byFamily: Array<{ family: G8V2ConflictFamily; conflicts: number; metadataOnly: number; substantive: number; unknown: number }>;
  };
  assessments: G8V2ConflictAssessment[];
  resolutionPlan: {
    contract: typeof G8_V2_CONFLICT_PLAN_CONTRACT;
    defaultSafeToReplace: false;
    entries: Array<{
      path: string;
      disposition: G8V2ResolutionDisposition;
      recommendedDisposition: G8V2ResolutionDisposition;
      safeToReplace: boolean;
      rollbackEvidence: 'complete-actual-document-in-private-snapshot';
      requiresExplicitApproval: boolean;
      rationale: string;
    }>;
  };
  readAccounting: {
    selector: { planned: 1; attempted: number; succeeded: number; failed: number; unknown: number };
    exactPaths: { planned: 3352; attempted: number; succeeded: number; failed: number; unknown: number };
    collectionScans: 0;
  };
  writeAccounting: { planned: 0; attempted: 0; succeeded: 0; failed: 0; unknown: 0 };
  digests: { inventory: string; input: string; evidence: string; plan: string };
};

const METADATA_ONLY_POINTERS = new Set([
  '/canonicalActivation/identitySchemaVersion',
  '/canonicalActivation/sourceCommit',
  '/canonicalActivation/shadowSourceCommit',
  '/canonicalActivation/activationImplementationCommit',
]);
const PROTECTED_POINTER = /(?:^|\/)(?:provenance|eligibility|predictionEligibility|candidates|metrics|research|researchText|summary|text|sources?|links?|sourceUrl|updatedAt|createdAt|capturedAt|timestamp|timestamps)(?:\/|$)/i;
const safeErrorCode = (value: unknown) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(value) ? value : 'READ_FAILED';
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerToken = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const valueType = (value: unknown) => value === undefined ? 'absent' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value;
const digest = (value: unknown) => localProductDigest(value);

function assertExactKeys(value: Json, keys: readonly string[], at: string) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`unexpected ${at} field: ${key}`);
  for (const key of keys) if (!(key in value)) throw new Error(`missing ${at} field: ${key}`);
}

function assertLosslessJson(value: unknown, at = 'value'): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (Number.isFinite(value)) return; throw new Error(`unsupported Firestore value at ${at}`); }
  if (Array.isArray(value)) { value.forEach((item, index) => assertLosslessJson(item, `${at}/${index}`)); return; }
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`unsupported Firestore value at ${at}`);
  if ('__firestoreType' in value) {
    assertExactKeys(value, ['__firestoreType', 'seconds', 'nanoseconds'], `${at} timestamp`);
    if (value.__firestoreType !== 'timestamp/v1' || !Number.isInteger(value.seconds) || !Number.isInteger(value.nanoseconds)
      || (value.nanoseconds as number) < 0 || (value.nanoseconds as number) >= 1_000_000_000 || (value.nanoseconds as number) % 1_000 !== 0) {
      throw new Error(`malformed Firestore timestamp tag at ${at}`);
    }
    return;
  }
  if ('seconds' in value && 'nanoseconds' in value) throw new Error(`malformed Firestore timestamp lookalike at ${at}`);
  for (const [key, child] of Object.entries(value)) assertLosslessJson(child, `${at}/${pointerToken(key)}`);
}

function cloneLossless(value: Json, at: string): Json {
  const encoded = encodeFirestoreSnapshotValue(value, at);
  assertLosslessJson(encoded, at);
  return structuredClone(encoded) as Json;
}

export function classifyG8V2ConflictFamily(path: string): G8V2ConflictFamily {
  if (/^races\/[^/]+$/.test(path)) return 'races';
  if (/^ballotMeasures\/[^/]+$/.test(path)) return 'measures';
  if (/^races\/[^/]+\/candidateResearch\/[^/]+$/.test(path)) return 'candidateResearch';
  if (/^ballotMeasures\/[^/]+\/research\/baseline$/.test(path)) return 'measureResearch';
  if (/^contestMetrics\/[^/]+$/.test(path)) return 'metrics';
  throw new Error(`unsupported active conflict path: ${path}`);
}

function compareValues(actual: unknown, expected: unknown, pointer = ''): G8V2JsonPointerDifference[] {
  if (actual !== undefined) assertLosslessJson(actual, `actual${pointer || '/'}`);
  if (expected !== undefined) assertLosslessJson(expected, `expected${pointer || '/'}`);
  if (actual !== undefined && expected !== undefined && digest(actual) === digest(expected)) return [];
  const actualRecord = isRecord(actual) && !('__firestoreType' in actual);
  const expectedRecord = isRecord(expected) && !('__firestoreType' in expected);
  if (actualRecord && expected === undefined && Object.keys(actual).length > 0) {
    return Object.keys(actual).sort().flatMap((key) => compareValues(actual[key], undefined, `${pointer}/${pointerToken(key)}`));
  }
  if (expectedRecord && actual === undefined && Object.keys(expected).length > 0) {
    return Object.keys(expected).sort().flatMap((key) => compareValues(undefined, expected[key], `${pointer}/${pointerToken(key)}`));
  }
  if (Array.isArray(actual) && expected === undefined && actual.length > 0) {
    return actual.flatMap((item, index) => compareValues(item, undefined, `${pointer}/${index}`));
  }
  if (Array.isArray(expected) && actual === undefined && expected.length > 0) {
    return expected.flatMap((item, index) => compareValues(undefined, item, `${pointer}/${index}`));
  }
  if (actualRecord && expectedRecord) {
    const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
    return keys.flatMap((key) => compareValues(actual[key], expected[key], `${pointer}/${pointerToken(key)}`));
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const length = Math.max(actual.length, expected.length);
    return Array.from({ length }, (_, index) => compareValues(actual[index], expected[index], `${pointer}/${index}`)).flat();
  }
  const kind: G8V2DifferenceKind = actual === undefined ? 'expected-only' : expected === undefined ? 'production-only' : 'changed';
  return [{
    pointer: pointer || '/', kind, actualType: valueType(actual), expectedType: valueType(expected),
    actualValueDigest: actual === undefined ? null : digest(actual), expectedValueDigest: expected === undefined ? null : digest(expected),
  }];
}

export function diffG8V2ConflictDocuments(actual: Json, expected: Json) {
  return compareValues(cloneLossless(actual, 'actual'), cloneLossless(expected, 'expected'));
}

function assessConflict(conflict: G8V2ConflictDocument): G8V2ConflictAssessment {
  const pointers = conflict.differences.map((item) => item.pointer);
  const protectedPointers = pointers.filter((pointer) => PROTECTED_POINTER.test(pointer));
  let classification: G8V2ConflictClassification;
  if (sameG8V2ActivationData(conflict.actual, conflict.expected)) classification = 'exact-after-safe-normalization';
  else if (pointers.length > 0 && pointers.every((pointer) => METADATA_ONLY_POINTERS.has(pointer))) classification = 'metadata-only';
  else if (pointers.length > 0) classification = 'substantive';
  else classification = 'unknown';
  const envelope = isRecord(conflict.actual.canonicalActivation) ? conflict.actual.canonicalActivation : null;
  const likelyRemnant = envelope?.contract === 'g8-3a-v2-activation/v1'
    && typeof envelope.activationImplementationCommit === 'string'
    && envelope.activationImplementationCommit !== (isRecord(conflict.expected.canonicalActivation) ? conflict.expected.canonicalActivation.activationImplementationCommit : null);
  const legacy = !envelope && (conflict.actual.generation === 'legacy-2026' || conflict.actual.registryGeneration === 'legacy-2026' || conflict.actual.catalogScope === 'legacy');
  const originInference = likelyRemnant ? 'likely-g8-4b-remnant' : legacy ? 'legacy-active' : envelope ? 'neither' : 'indeterminate';
  return {
    path: conflict.path, family: conflict.family, classification,
    metadataAllowlistVersion: 'g8-4br5a-activation-envelope/v1', protectedPointers,
    productionOnlyPointers: [...conflict.productionOnlyPointers],
    safeToReplace: classification === 'exact-after-safe-normalization' && protectedPointers.length === 0 && conflict.productionOnlyPointers.length === 0,
    originInference,
    inferenceBasis: likelyRemnant ? 'inference: activation envelope matches the v2 contract but carries a non-current implementation identity'
      : legacy ? 'inference: document carries an explicit legacy generation/scope marker'
        : envelope ? 'inference: v2 activation envelope does not match the G8.4B-remnant heuristic'
          : 'inference: no recognized activation or explicit legacy marker; local bundle comparison is required',
  };
}

function emptyFamilyCounts() {
  return { expected: 0, exact: 0, missing: 0, conflicting: 0, unknown: 0 };
}

function snapshotWithoutDigests(snapshot: Omit<G8V2ConflictSnapshot, 'digests'>) {
  return snapshot;
}

function computeDigests(snapshot: Omit<G8V2ConflictSnapshot, 'digests'>) {
  return {
    inventory: digest(snapshot.inventory.map(({ path, family, expectedDigest }) => ({ path, family, expectedDigest }))),
    input: digest({ capture: snapshot.capture, selector: snapshot.selector, inventory: snapshot.inventory, readAccounting: snapshot.readAccounting, writeAccounting: snapshot.writeAccounting }),
    evidence: digest({ conflicts: snapshot.conflicts, unknown: snapshot.unknown }),
    plan: digest({ summaries: snapshot.summaries, assessments: snapshot.assessments, resolutionPlan: snapshot.resolutionPlan }),
  };
}

export function buildG8V2ConflictSnapshot(options: {
  plan: G8V2ActivationPlan;
  capture: G8V2ConflictCaptureIdentity;
  selector: { actual: Json | null; errorCode?: string };
  observations: G8V2ConflictObservation[];
}): G8V2ConflictSnapshot {
  const { plan, capture } = options;
  if (plan.documents.length !== 3352 || plan.expectedCounts.contentDocuments !== 3352) throw new Error('conflict capture requires the exact certified 3,352-path plan');
  if (capture.projectId !== plan.target.projectId || capture.databaseId !== plan.target.databaseId || capture.generation !== plan.generation
    || capture.shadowSourceCommit !== plan.shadowSourceCommit || capture.activationImplementationCommit !== plan.activationImplementationCommit
    || !/^[a-f0-9]{40}$/.test(capture.conflictAnalysisImplementationCommit) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(capture.captureReceipt)
    || Number.isNaN(Date.parse(capture.capturedAt))) throw new Error('invalid conflict capture identity');
  const expectedByPath = new Map(plan.documents.map((document) => [document.path, document]));
  const observedByPath = new Map<string, G8V2ConflictObservation>();
  for (const observation of options.observations) {
    if (!expectedByPath.has(observation.path)) throw new Error(`unknown conflict observation path: ${observation.path}`);
    if (observedByPath.has(observation.path)) throw new Error(`duplicate conflict observation path: ${observation.path}`);
    if (observation.errorCode && observation.actual !== null) throw new Error(`failed conflict observation contains a document: ${observation.path}`);
    observedByPath.set(observation.path, observation);
  }
  if (observedByPath.size !== 3352) throw new Error('conflict capture requires one observation for every exact path');
  const conflicts: G8V2ConflictDocument[] = [];
  const unknown: G8V2ConflictSnapshot['unknown'] = [];
  const inventory: G8V2ConflictSnapshot['inventory'] = [];
  const families: G8V2ConflictSnapshot['counts']['families'] = {
    races: emptyFamilyCounts(), measures: emptyFamilyCounts(), candidateResearch: emptyFamilyCounts(), measureResearch: emptyFamilyCounts(), metrics: emptyFamilyCounts(),
  };
  let succeeded = 0;
  let failed = 0;
  let completionUnknown = 0;
  for (const document of plan.documents) {
    const family = classifyG8V2ConflictFamily(document.path);
    const expected = cloneLossless(document.data, `expected/${document.path}`);
    const expectedDigest = digest(expected);
    const observation = observedByPath.get(document.path)!;
    families[family].expected += 1;
    if (observation.errorCode) {
      const errorCode = safeErrorCode(observation.errorCode);
      unknown.push({ path: document.path, family, errorCode });
      inventory.push({ path: document.path, family, expectedDigest, classification: 'unknown', actualDigest: null, differenceCount: 0 });
      families[family].unknown += 1;
      if (errorCode === 'COMPLETION_UNKNOWN') completionUnknown += 1;
      else failed += 1;
      continue;
    }
    succeeded += 1;
    if (observation.actual === null) {
      inventory.push({ path: document.path, family, expectedDigest, classification: 'missing', actualDigest: null, differenceCount: 0 });
      families[family].missing += 1;
      continue;
    }
    const actual = cloneLossless(observation.actual, `actual/${document.path}`);
    const actualDigest = digest(actual);
    if (sameG8V2ActivationData(actual, expected)) {
      inventory.push({ path: document.path, family, expectedDigest, classification: 'exact', actualDigest, differenceCount: 0 });
      families[family].exact += 1;
      continue;
    }
    const differences = compareValues(actual, expected);
    if (differences.length === 0) throw new Error(`conflict has no JSON-pointer differences: ${document.path}`);
    const conflict = { path: document.path, family, actual, expected, actualDigest, expectedDigest, differences, productionOnlyPointers: differences.filter((item) => item.kind === 'production-only').map((item) => item.pointer) } satisfies G8V2ConflictDocument;
    conflicts.push(conflict);
    inventory.push({ path: document.path, family, expectedDigest, classification: 'conflicting', actualDigest, differenceCount: differences.length });
    families[family].conflicting += 1;
  }
  const assessments = conflicts.map(assessConflict);
  const pointerMap = new Map<string, { documents: Set<string>; productionOnly: number; expectedOnly: number; changed: number }>();
  for (const conflict of conflicts) for (const difference of conflict.differences) {
    const entry = pointerMap.get(difference.pointer) ?? { documents: new Set<string>(), productionOnly: 0, expectedOnly: 0, changed: 0 };
    entry.documents.add(conflict.path); entry[difference.kind === 'production-only' ? 'productionOnly' : difference.kind === 'expected-only' ? 'expectedOnly' : 'changed'] += 1;
    pointerMap.set(difference.pointer, entry);
  }
  const summaries = {
    byPointer: [...pointerMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([pointer, value]) => ({ pointer, documents: value.documents.size, productionOnly: value.productionOnly, expectedOnly: value.expectedOnly, changed: value.changed })),
    byFamily: (Object.keys(families) as G8V2ConflictFamily[]).map((family) => ({ family, conflicts: families[family].conflicting, metadataOnly: assessments.filter((item) => item.family === family && item.classification === 'metadata-only').length, substantive: assessments.filter((item) => item.family === family && item.classification === 'substantive').length, unknown: assessments.filter((item) => item.family === family && item.classification === 'unknown').length })),
  };
  const assessmentByPath = new Map(assessments.map((assessment) => [assessment.path, assessment]));
  const resolutionPlan = {
    contract: G8_V2_CONFLICT_PLAN_CONTRACT,
    defaultSafeToReplace: false as const,
    entries: conflicts.map((conflict) => {
      const assessment = assessmentByPath.get(conflict.path)!;
      const recommendedDisposition: G8V2ResolutionDisposition = assessment.safeToReplace ? 'preserve-and-replace' : assessment.classification === 'metadata-only' ? 'preserve-and-replace' : 'unresolved';
      return { path: conflict.path, disposition: 'unresolved' as const, recommendedDisposition, safeToReplace: assessment.safeToReplace, rollbackEvidence: 'complete-actual-document-in-private-snapshot' as const, requiresExplicitApproval: true, rationale: assessment.safeToReplace ? 'semantic equality after the tested lossless codec; replacement still requires explicit approval' : assessment.classification === 'metadata-only' ? 'only the narrow activation-envelope allowlist differs; default remains unsafe until approved' : 'substantive, protected, production-only, or unknown differences require explicit resolution' };
    }),
  };
  const counts = { expected: 3352, exact: inventory.filter((item) => item.classification === 'exact').length, missing: inventory.filter((item) => item.classification === 'missing').length, conflicting: conflicts.length, unknown: unknown.length, families };
  const selectorActual = options.selector.actual === null ? null : cloneLossless(options.selector.actual, 'selector');
  const selectorError = options.selector.errorCode ? safeErrorCode(options.selector.errorCode) : null;
  if (selectorError && selectorActual !== null) throw new Error('failed selector observation contains a document');
  const selector = { path: 'catalogActivations/canonical-2026' as const, status: selectorError ? 'unknown' as const : selectorActual ? 'present' as const : 'absent' as const, actual: selectorActual, actualDigest: selectorActual ? digest(selectorActual) : null, errorCode: selectorError };
  const base: Omit<G8V2ConflictSnapshot, 'digests'> = {
    schemaVersion: 1, contract: G8_V2_CONFLICT_SNAPSHOT_CONTRACT, capture, selector, inventory, conflicts, unknown, counts, summaries, assessments, resolutionPlan,
    readAccounting: { selector: { planned: 1, attempted: 1, succeeded: selectorError ? 0 : 1, failed: selectorError && selectorError !== 'COMPLETION_UNKNOWN' ? 1 : 0, unknown: selectorError === 'COMPLETION_UNKNOWN' ? 1 : 0 }, exactPaths: { planned: 3352, attempted: 3352, succeeded, failed, unknown: completionUnknown }, collectionScans: 0 },
    writeAccounting: { planned: 0, attempted: 0, succeeded: 0, failed: 0, unknown: 0 },
  };
  const snapshot = { ...snapshotWithoutDigests(base), digests: computeDigests(base) };
  return snapshot;
}

export function validateG8V2ConflictSnapshot(value: unknown, plan: G8V2ActivationPlan): G8V2ConflictSnapshot {
  if (!isRecord(value)) throw new Error('conflict snapshot must be an object');
  assertExactKeys(value, ['schemaVersion','contract','capture','selector','inventory','conflicts','unknown','counts','summaries','assessments','resolutionPlan','readAccounting','writeAccounting','digests'], 'conflict snapshot');
  if (value.schemaVersion !== 1 || value.contract !== G8_V2_CONFLICT_SNAPSHOT_CONTRACT || !isRecord(value.capture) || !Array.isArray(value.inventory) || !Array.isArray(value.conflicts) || !Array.isArray(value.unknown)) throw new Error('malformed conflict snapshot contract');
  const rebuiltObservations: G8V2ConflictObservation[] = [];
  const conflictsByPath = new Map((value.conflicts as unknown[]).map((item) => {
    if (!isRecord(item) || typeof item.path !== 'string' || !isRecord(item.actual)) throw new Error('malformed conflict evidence');
    return [item.path, item] as const;
  }));
  const unknownByPath = new Map((value.unknown as unknown[]).map((item) => {
    if (!isRecord(item) || typeof item.path !== 'string' || typeof item.errorCode !== 'string') throw new Error('malformed unknown conflict evidence');
    return [item.path, item.errorCode] as const;
  }));
  for (const item of value.inventory as unknown[]) {
    if (!isRecord(item) || typeof item.path !== 'string' || typeof item.classification !== 'string') throw new Error('malformed conflict inventory');
    if (item.classification === 'conflicting') {
      const conflict = conflictsByPath.get(item.path); if (!conflict) throw new Error(`missing conflict evidence: ${item.path}`);
      rebuiltObservations.push({ path: item.path, actual: conflict.actual as Json });
    } else if (item.classification === 'unknown') rebuiltObservations.push({ path: item.path, actual: null, errorCode: unknownByPath.get(item.path) ?? 'READ_FAILED' });
    else if (item.classification === 'missing') rebuiltObservations.push({ path: item.path, actual: null });
    else if (item.classification === 'exact') {
      const expected = plan.documents.find((document) => document.path === item.path); if (!expected) throw new Error(`unknown exact path: ${item.path}`);
      rebuiltObservations.push({ path: item.path, actual: expected.data });
    } else throw new Error(`invalid conflict classification: ${item.classification}`);
  }
  const rebuilt = buildG8V2ConflictSnapshot({ plan, capture: value.capture as G8V2ConflictCaptureIdentity, selector: { actual: (value.selector as Json)?.actual as Json | null, ...((value.selector as Json)?.errorCode ? { errorCode: String((value.selector as Json).errorCode) } : {}) }, observations: rebuiltObservations });
  if (digest(rebuilt) !== digest(value)) throw new Error('conflict snapshot tampering or digest mismatch');
  return value as G8V2ConflictSnapshot;
}

function sourcePayloadMatch(actual: Json, source: Json) {
  const differing = Object.keys(source).filter((key) => !(key in actual) || !sameG8V2ActivationData(actual[key], source[key]));
  return { matched: differing.length === 0, differingSourcePointers: differing.sort().map((key) => `/${pointerToken(key)}`), productionOnlyTopLevelPointers: Object.keys(actual).filter((key) => !(key in source)).sort().map((key) => `/${pointerToken(key)}`) };
}

export function buildG8V2ConflictAnalysisReport(snapshotValue: unknown, plan: G8V2ActivationPlan, comparisonBundles: Array<{ label: string; value: unknown }> = []) {
  const snapshot = validateG8V2ConflictSnapshot(snapshotValue, plan);
  const labels = new Set<string>();
  const comparisons = comparisonBundles.map(({ label, value }) => {
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(label) || labels.has(label)) throw new Error(`invalid or duplicate comparison label: ${label}`);
    labels.add(label);
    const bundle = validateLocalProductBundle(value);
    const documents = new Map(bundle.documents.filter((document) => document.path !== 'catalogActivations/canonical-2026').map((document) => [document.path, document.data]));
    return { label, bundle, documents };
  });
  const conflicts = snapshot.conflicts.map((conflict) => {
    const localComparisons = comparisons.map(({ label, bundle, documents }) => {
      const source = documents.get(conflict.path);
      return { label, bundleDigest: bundle.bundleDigest, ...(source ? sourcePayloadMatch(conflict.actual, source) : { matched: false, differingSourcePointers: ['/'], productionOnlyTopLevelPointers: Object.keys(conflict.actual).sort().map((key) => `/${pointerToken(key)}`) }) };
    });
    const matchedLabels = localComparisons.filter((item) => item.matched).map((item) => item.label);
    const matchedDigests = new Set(localComparisons.filter((item) => item.matched).map((item) => item.bundleDigest));
    return { path: conflict.path, assessment: snapshot.assessments.find((item) => item.path === conflict.path)!, localComparisons, inference: matchedLabels.length === 0 ? 'no supplied local bundle payload matches all of its source fields' : matchedDigests.size < matchedLabels.length ? `matches byte-equivalent local bundle payloads (${matchedLabels.join(', ')}); those sources do not distinguish provenance` : `matches local bundle payload: ${matchedLabels.join(', ')}` };
  });
  const comparisonInventory = comparisons.map(({ label, bundle }) => ({ label, bundleDigest: bundle.bundleDigest, planDigest: bundle.planDigest, documentCount: bundle.documents.length }));
  return {
    schemaVersion: 1,
    contract: G8_V2_CONFLICT_ANALYSIS_CONTRACT,
    firebaseImported: false,
    credentialsLoaded: false,
    networkRequests: 0,
    snapshot: { contract: snapshot.contract, inputDigest: snapshot.digests.input, evidenceDigest: snapshot.digests.evidence, planDigest: snapshot.digests.plan },
    counts: snapshot.counts,
    summaries: snapshot.summaries,
    conflicts,
    resolutionPlan: snapshot.resolutionPlan,
    comparisonInventory,
    comparisonDigest: digest({ comparisonInventory, conflicts: conflicts.map(({ path, localComparisons, inference }) => ({ path, localComparisons, inference })) }),
  };
}
