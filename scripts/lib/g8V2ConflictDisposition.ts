import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { buildCanonicalMeasurePlan } from './canonicalBallotMeasures.js';
import { buildCanonicalPublicationPlan, validateCanonicalPublicationSnapshot, type CanonicalPublicationSnapshot } from './canonicalPublication.js';
import { validateCongressDepthSnapshot } from './congressDepth.js';
import { validateFecBulkFinanceSnapshot } from './fecBulkFinance.js';
import { validateG8ReleaseManifest } from './g8ReleaseReadiness.js';
import { validateHistoricalCvapSnapshot } from './historicalCvapDepth.js';
import { buildLocalProductBundle, localProductDigest, validateLocalProductBundle, type LocalProductBundle } from './localProductBundle.js';
import { validateG8V2ConflictSnapshot, type G8V2ConflictDocument, type G8V2ConflictFamily, type G8V2ConflictSnapshot } from './g8V2ConflictAnalysis.js';
import type { G8V2ActivationPlan } from './g8V2Activation.js';

type Json = Record<string, unknown>;

export const G8_V2_DISPOSITION_CONTRACT = 'g8-4br6a-conflict-disposition-plan/v1' as const;
export const G8_V2_DISPOSITION_REPORT_CONTRACT = 'g8-4br6a-conflict-disposition-report/v1' as const;
export const G8_V2_DISPOSITION_POINTER_CONTRACT = 'g8-4br6a-durable-pointer-rules/v1' as const;

export type G8V2DispositionDifferenceKind = 'reorder' | 'identity' | 'value' | 'expected-only' | 'production-only';
export type G8V2DispositionProvenanceClass =
  | 'current-certified-authoritative'
  | 'existing-value-with-validated-source'
  | 'runtime-metadata'
  | 'identity-conflict'
  | 'unsupported-production-only-value'
  | 'ambiguous/unresolved';
export type G8V2DraftDisposition = 'preserve-current' | 'replace-with-certified' | 'deterministic-merge' | 'unresolved';
export type G8V2DispositionBlockerClass = 'none' | 'identity-conflict' | 'unsupported-production-only' | 'conflicting-lineage' | 'ambiguous-lineage';

export type G8V2DispositionDifference = {
  pointer: string;
  kind: G8V2DispositionDifferenceKind;
  actualValueDigest: string | null;
  expectedValueDigest: string | null;
  identityDigest?: string;
  identitySide?: 'production-only' | 'expected-only' | 'invalid-or-duplicate';
};

export type G8V2LineageArtifact = {
  id: string;
  role: string;
  path: string;
  bytes: number;
  fileSha256: string;
  semanticDigests: string[];
  accepted: true;
};

export type G8V2LineageCatalog = {
  contract: 'g8-4br6a-lineage-catalog/v1';
  artifacts: G8V2LineageArtifact[];
  links: Array<{ from: string; to: string; digest: string; relation: string }>;
  rebuiltBundleDigest: string;
  currentHistoricalByteIdentical: boolean;
  catalogDigest: string;
};

export type G8V2DispositionPointerRule = G8V2DispositionDifference & {
  provenanceClass: G8V2DispositionProvenanceClass;
  blockerClass: G8V2DispositionBlockerClass;
  evidenceDigests: string[];
  rationale: string;
};

export type G8V2DispositionEntry = {
  path: string;
  family: G8V2ConflictFamily;
  disposition: G8V2DraftDisposition;
  safeToReplace: boolean;
  pointerSignature: string;
  pointerRules: G8V2DispositionPointerRule[];
  evidenceDigests: string[];
  proposedOutputDigest: string;
  proposedOutputBasis: 'preserved-current' | 'certified-output' | 'deterministic-merge' | 'no-op-unresolved';
  rollbackDigest: string;
  rollbackEvidence: 'complete-actual-document-in-immutable-br5b-snapshot';
  rationale: string;
};

export type G8V2DispositionPlan = {
  schemaVersion: 1;
  contract: typeof G8_V2_DISPOSITION_CONTRACT;
  pointerContract: typeof G8_V2_DISPOSITION_POINTER_CONTRACT;
  lineage: G8V2LineageCatalog;
  snapshot: { contract: string; bytes: number; fileSha256: string; inputDigest: string; evidenceDigest: string; planDigest: string };
  policy: {
    currentProductionPresenceIsAuthority: false;
    inferenceCanSetSafeToReplace: false;
    productionOnlyDiscardRequiresRollbackEvidence: true;
    protectedFieldsRequireCertifiedV2Chain: true;
    sourcedFieldsRequireValidatedLineage: true;
  };
  entries: G8V2DispositionEntry[];
  aggregate: ReturnType<typeof aggregateEntries>;
  readiness: {
    readyForExecutor: boolean;
    deterministicallyResolved: number;
    unresolved: number;
    reproducibleOutputs: boolean;
    rollbackEvidenceComplete: boolean;
    policyConflicts: number;
    nextEvidenceBatches: Array<{ batchId: string; family: G8V2ConflictFamily; blockerClass: G8V2DispositionBlockerClass; pointerSignature: string; documents: number; pathListDigest: string }>;
  };
  safety: { firebaseImported: false; credentialsLoaded: false; networkRequests: 0; productionOperations: 0 };
  digests: { entries: string; aggregate: string; plan: string };
};

export type G8V2DispositionPaths = {
  snapshot: string;
  currentBundle: string;
  historicalBundle: string;
  manifest: string;
  publication: string;
  finance: string;
  congress: string;
  historicalCvap: string;
  measures: string;
};

export const G8_V2_DISPOSITION_DEFAULT_PATHS: G8V2DispositionPaths = {
  snapshot: '.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json',
  currentBundle: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  historicalBundle: '.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json',
  manifest: 'docs/g8-catalog-beta-release-manifest.json',
  publication: '.artifacts/private/canonical-migration/g8-1-approved-catalog-beta-2026-08-04.json',
  finance: '.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json',
  congress: '.artifacts/private/canonical-migration/g6-3-congress-depth-v2.json',
  historicalCvap: '.artifacts/private/canonical-migration/g6-4-historical-cvap-depth.json',
  measures: 'data/2026/statewide-ballot-measures.json',
};

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = (value: unknown) => localProductDigest(value);
const pointerToken = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const pointerUntoken = (value: string) => value.replace(/~1/g, '/').replace(/~0/g, '~');
const fileSha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const same = (left: unknown, right: unknown) => digest(left) === digest(right);

function expect(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function pointerSignaturePointer(pointer: string) {
  return pointer.replace(/@id-sha256:[a-f0-9]{64}/g, '@id');
}

function artifact(id: string, role: string, path: string, semanticDigests: string[]): G8V2LineageArtifact {
  const resolved = resolve(path);
  return {
    id,
    role,
    path: relative(process.cwd(), resolved).replace(/\\/g, '/'),
    bytes: statSync(resolved).size,
    fileSha256: fileSha256(resolved),
    semanticDigests: sortedUnique(semanticDigests),
    accepted: true,
  };
}

function candidateIndex(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const values = new Map<string, Json>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const identity = typeof item.id === 'string' && item.id.length > 0 ? item.id
      : typeof item.candidateId === 'string' && item.candidateId.length > 0 ? item.candidateId
        : null;
    if (!identity || values.has(identity)) return null;
    ids.push(identity);
    values.set(identity, item);
  }
  return { ids, values };
}

function isCandidatePointer(pointer: string) {
  return /(?:^|\/)candidates$/.test(pointer);
}

function compareDispositionValues(actual: unknown, expected: unknown, pointer: string): G8V2DispositionDifference[] {
  if (actual !== undefined && expected !== undefined && same(actual, expected)) return [];
  if ((Array.isArray(actual) || Array.isArray(expected)) && isCandidatePointer(pointer)) {
    const actualIndex = actual === undefined ? { ids: [] as string[], values: new Map<string, Json>() } : candidateIndex(actual);
    const expectedIndex = expected === undefined ? { ids: [] as string[], values: new Map<string, Json>() } : candidateIndex(expected);
    if (!actualIndex || !expectedIndex) {
      return [{ pointer: pointer || '/', kind: 'identity', actualValueDigest: actual === undefined ? null : digest(actual), expectedValueDigest: expected === undefined ? null : digest(expected), identityDigest: digest({ actual: actualIndex?.ids ?? null, expected: expectedIndex?.ids ?? null }), identitySide: 'invalid-or-duplicate' }];
    }
    const differences: G8V2DispositionDifference[] = [];
    const actualSet = new Set(actualIndex.ids);
    const expectedSet = new Set(expectedIndex.ids);
    if (actualIndex.ids.length === expectedIndex.ids.length && actualIndex.ids.every((id) => expectedSet.has(id)) && actualIndex.ids.some((id, index) => id !== expectedIndex.ids[index])) {
      differences.push({ pointer: pointer || '/', kind: 'reorder', actualValueDigest: digest(actualIndex.ids), expectedValueDigest: digest(expectedIndex.ids) });
    }
    for (const id of actualIndex.ids.filter((candidateId) => !expectedSet.has(candidateId)).sort()) {
      const durablePointer = `${pointer}/${pointerToken(`@id-sha256:${digest(id)}`)}`;
      differences.push({ pointer: durablePointer, kind: 'identity', actualValueDigest: digest(actualIndex.values.get(id)), expectedValueDigest: null, identityDigest: digest(id), identitySide: 'production-only' });
    }
    for (const id of expectedIndex.ids.filter((candidateId) => !actualSet.has(candidateId)).sort()) {
      const durablePointer = `${pointer}/${pointerToken(`@id-sha256:${digest(id)}`)}`;
      differences.push({ pointer: durablePointer, kind: actual === undefined ? 'expected-only' : 'identity', actualValueDigest: null, expectedValueDigest: digest(expectedIndex.values.get(id)), identityDigest: digest(id), ...(actual === undefined ? {} : { identitySide: 'expected-only' as const }) });
    }
    for (const id of actualIndex.ids.filter((candidateId) => expectedSet.has(candidateId)).sort()) {
      const durablePointer = `${pointer}/${pointerToken(`@id-sha256:${digest(id)}`)}`;
      differences.push(...compareDispositionValues(actualIndex.values.get(id), expectedIndex.values.get(id), durablePointer));
    }
    return differences;
  }
  if (isRecord(actual) && isRecord(expected)) {
    const keys = sortedUnique([...Object.keys(actual), ...Object.keys(expected)]);
    return keys.flatMap((key) => compareDispositionValues(actual[key], expected[key], `${pointer}/${pointerToken(key)}`));
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) => compareDispositionValues(actual[index], expected[index], `${pointer}/${index}`)).flat();
  }
  if (isRecord(actual) && expected === undefined) return Object.keys(actual).sort().flatMap((key) => compareDispositionValues(actual[key], undefined, `${pointer}/${pointerToken(key)}`));
  if (isRecord(expected) && actual === undefined) return Object.keys(expected).sort().flatMap((key) => compareDispositionValues(undefined, expected[key], `${pointer}/${pointerToken(key)}`));
  if (Array.isArray(actual) && expected === undefined) return actual.flatMap((item, index) => compareDispositionValues(item, undefined, `${pointer}/${index}`));
  if (Array.isArray(expected) && actual === undefined) return expected.flatMap((item, index) => compareDispositionValues(undefined, item, `${pointer}/${index}`));
  return [{
    pointer: pointer || '/',
    kind: actual === undefined ? 'expected-only' : expected === undefined ? 'production-only' : 'value',
    actualValueDigest: actual === undefined ? null : digest(actual),
    expectedValueDigest: expected === undefined ? null : digest(expected),
  }];
}

export function diffG8V2DispositionValues(actual: Json, expected: Json) {
  return compareDispositionValues(actual, expected, '');
}

function getPointer(value: unknown, pointer: string): unknown {
  if (pointer === '/') return value;
  let current = value;
  for (const raw of pointer.split('/').slice(1)) {
    const key = pointerUntoken(raw);
    if (key.startsWith('@id-sha256:')) {
      if (!Array.isArray(current)) return undefined;
      const identityDigest = key.slice('@id-sha256:'.length);
      const matches = current.filter((item) => {
        if (!isRecord(item)) return false;
        const identity = typeof item.id === 'string' && item.id.length > 0 ? item.id : typeof item.candidateId === 'string' ? item.candidateId : '';
        return identity.length > 0 && digest(identity) === identityDigest;
      });
      if (matches.length !== 1) return undefined;
      current = matches[0];
      continue;
    }
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(key)) return undefined;
      current = current[Number(key)];
    } else if (isRecord(current)) current = current[key];
    else return undefined;
  }
  return current;
}

function setPointer(target: Json, pointer: string, value: unknown) {
  const keys = pointer.split('/').slice(1).map(pointerUntoken);
  let current: unknown = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (key.startsWith('@id-sha256:')) throw new Error('BR6A_DURABLE_IDENTITY_MERGE_FORBIDDEN');
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(key)) throw new Error('BR6A_INVALID_MERGE_ARRAY_POINTER');
      const position = Number(key);
      if (current[position] === undefined) current[position] = /^\d+$/.test(keys[index + 1]) ? [] : {};
      current = current[position];
    }
    else if (isRecord(current)) {
      if (!(key in current)) current[key] = /^\d+$/.test(keys[index + 1]) ? [] : {};
      current = current[key];
    } else throw new Error('BR6A_INVALID_MERGE_POINTER');
  }
  const last = keys.at(-1);
  if (last === undefined || last.startsWith('@id-sha256:')) throw new Error('BR6A_INVALID_MERGE_POINTER');
  if (Array.isArray(current)) current[Number(last)] = structuredClone(value);
  else if (isRecord(current)) current[last] = structuredClone(value);
  else throw new Error('BR6A_INVALID_MERGE_POINTER');
}

function rawPublicationDocuments(publication: CanonicalPublicationSnapshot) {
  const documents = new Map<string, Json>();
  for (const race of publication.inputs.races) documents.set(`races/${race.id}`, race);
  for (const research of publication.inputs.candidateResearch) documents.set(`races/${research.raceId}/candidateResearch/${research.candidateId}`, research.data);
  for (const metric of publication.inputs.contestMetrics) documents.set(`contestMetrics/${metric.raceId}`, metric.data);
  return documents;
}

function expectedEvidenceIds(family: G8V2ConflictFamily, pointer: string) {
  if (pointer.startsWith('/canonicalActivation/') || /^\/(?:catalogScope|registryGeneration)$/.test(pointer)) return ['current-bundle', 'release-manifest'];
  if (family === 'races') return ['approved-publication', 'current-bundle', 'release-manifest'];
  if (family === 'metrics') {
    if (pointer.startsWith('/comparativeFinance/')) return ['approved-publication', 'finance', 'current-bundle'];
    if (/^\/(?:historical|turnout|demographics|historicalCvap|baselineMetrics)(?:\/|$)/.test(pointer)) return ['approved-publication', 'finance', 'congress', 'historical-cvap', 'current-bundle'];
  }
  return ['current-bundle', 'release-manifest'];
}

const RUNTIME_POINTER = /(?:^|\/)(?:updatedAt|createdAt|capturedAt|lastRefreshedAt|sourceUpdatedAt|canonicalActivation)(?:\/|$)/i;
const PROTECTED_POINTER = /(?:^|\/)(?:id|raceId|candidateId|eligibleCandidateIds|predictionEligibility|eligibility|pickEligibility|qualificationStatus|visibility|publicationState|status|mode|closeAt|closeDate|deadlineKind|deadlineProvenance|lockPolicyId|lockPolicyVersion|lockReason|registryGeneration|catalogScope)(?:\/|$)/i;

export function classifyG8V2DispositionDifference(options: {
  difference: G8V2DispositionDifference;
  family: G8V2ConflictFamily;
  path: string;
  sourceDocuments: Array<{ artifactId: string; artifactDigest: string; documents: Map<string, Json> }>;
  artifactDigests: Map<string, string[]>;
}): G8V2DispositionPointerRule {
  const { difference, family, path } = options;
  if (difference.kind === 'identity') {
    return { ...difference, provenanceClass: 'identity-conflict', blockerClass: 'identity-conflict', evidenceDigests: sortedUnique([...(options.artifactDigests.get('current-bundle') ?? []), ...(options.artifactDigests.get('approved-publication') ?? [])]), rationale: 'candidate identity is compared by durable id digest and may be changed only by the certified v2 chain; source inference cannot resolve an identity conflict' };
  }
  if (difference.kind === 'reorder') {
    return { ...difference, provenanceClass: 'current-certified-authoritative', blockerClass: 'none', evidenceDigests: sortedUnique(options.artifactDigests.get('current-bundle') ?? []), rationale: 'the durable candidate identity set is unchanged and only certified ordering differs' };
  }
  if (difference.kind === 'production-only') {
    if (RUNTIME_POINTER.test(difference.pointer)) {
      return { ...difference, provenanceClass: 'runtime-metadata', blockerClass: 'none', evidenceDigests: sortedUnique(options.artifactDigests.get('snapshot') ?? []), rationale: 'runtime metadata is preserved unless an executor is separately authorized' };
    }
    const observed = options.sourceDocuments.flatMap((source) => {
      const sourceValue = getPointer(source.documents.get(path), difference.pointer);
      return sourceValue === undefined ? [] : [{ artifactId: source.artifactId, artifactDigest: source.artifactDigest, valueDigest: digest(sourceValue) }];
    });
    const distinct = new Set(observed.map((item) => item.valueDigest));
    if (distinct.size > 1) {
      return { ...difference, provenanceClass: 'ambiguous/unresolved', blockerClass: 'conflicting-lineage', evidenceDigests: sortedUnique(observed.flatMap((item) => [item.artifactDigest, item.valueDigest])), rationale: 'validated source artifacts disagree at this production-only pointer' };
    }
    const matches = observed.filter((item) => item.valueDigest === difference.actualValueDigest);
    if (matches.length > 0) {
      return { ...difference, provenanceClass: 'existing-value-with-validated-source', blockerClass: 'none', evidenceDigests: sortedUnique(matches.flatMap((item) => [item.artifactDigest, item.valueDigest])), rationale: 'the production-only value matches a digest-validated local source artifact at the same path and pointer' };
    }
    return { ...difference, provenanceClass: 'unsupported-production-only-value', blockerClass: 'unsupported-production-only', evidenceDigests: sortedUnique([...(options.artifactDigests.get('snapshot') ?? []), ...(difference.actualValueDigest ? [difference.actualValueDigest] : [])]), rationale: 'production presence alone does not establish authority and no validated source artifact matches this value' };
  }
  if (RUNTIME_POINTER.test(difference.pointer)) {
    return { ...difference, provenanceClass: 'runtime-metadata', blockerClass: 'none', evidenceDigests: sortedUnique([...(options.artifactDigests.get('current-bundle') ?? []), ...(options.artifactDigests.get('snapshot') ?? [])]), rationale: 'the runtime envelope is deterministic in the certified activation plan and is not provenance for document content' };
  }
  const required = expectedEvidenceIds(family, difference.pointer);
  const missing = required.filter((id) => !(options.artifactDigests.get(id)?.length));
  if (missing.length > 0) {
    return { ...difference, provenanceClass: 'ambiguous/unresolved', blockerClass: 'ambiguous-lineage', evidenceDigests: [], rationale: `required validated lineage is missing: ${missing.join(',')}` };
  }
  const evidenceDigests = sortedUnique(required.flatMap((id) => options.artifactDigests.get(id) ?? []));
  return { ...difference, provenanceClass: 'current-certified-authoritative', blockerClass: 'none', evidenceDigests, rationale: PROTECTED_POINTER.test(difference.pointer) ? 'protected identity, eligibility, publication, deadline, lock, or registry state is accepted only from the certified v2 chain' : 'the expected value is reproduced by the digest-validated certified bundle and its required source chain' };
}

export function buildG8V2LineageCatalog(values: {
  paths: Omit<G8V2DispositionPaths, 'snapshot'>;
  currentBundle: unknown;
  historicalBundle: unknown;
  manifest: unknown;
  publication: unknown;
  finance: unknown;
  congress: unknown;
  historicalCvap: unknown;
  measures: unknown;
}) {
  const currentBundle = validateLocalProductBundle(values.currentBundle);
  const historicalBundle = validateLocalProductBundle(values.historicalBundle);
  expect(currentBundle.bundleDigest === historicalBundle.bundleDigest && same(currentBundle, historicalBundle), 'BR6A_CURRENT_HISTORICAL_BUNDLE_DRIFT');
  const manifestReceipt = validateG8ReleaseManifest(values.manifest, currentBundle);
  const publication = validateCanonicalPublicationSnapshot(values.publication);
  const finance = validateFecBulkFinanceSnapshot(values.finance);
  const congress = validateCongressDepthSnapshot(values.congress);
  const historicalCvap = validateHistoricalCvapSnapshot(values.historicalCvap);
  const measurePlan = buildCanonicalMeasurePlan(values.measures);
  expect(publication.inputDigest === currentBundle.sourceDigests.publication, 'BR6A_PUBLICATION_LINEAGE_MISMATCH');
  expect(finance.inputDigest === currentBundle.sourceDigests.finance && finance.capture.sourceSnapshotInputDigest === publication.inputDigest, 'BR6A_FINANCE_LINEAGE_MISMATCH');
  expect(congress.inputDigest === currentBundle.sourceDigests.congress && congress.publicationInputDigest === publication.inputDigest && congress.financeInputDigest === finance.inputDigest, 'BR6A_CONGRESS_LINEAGE_MISMATCH');
  expect(historicalCvap.inputDigest === currentBundle.sourceDigests.historicalCvap && historicalCvap.sourceDigest === currentBundle.sourceDigests.historicalCvapSource
    && historicalCvap.publicationInputDigest === publication.inputDigest && historicalCvap.financeInputDigest === finance.inputDigest && historicalCvap.congressInputDigest === congress.inputDigest, 'BR6A_HISTORICAL_CVAP_LINEAGE_MISMATCH');
  const rebuilt = buildLocalProductBundle({ publicationValue: publication, financeValue: finance, congressValue: congress, historicalValue: historicalCvap, measureRegistryValue: values.measures });
  expect(rebuilt.bundleDigest === currentBundle.bundleDigest && same(rebuilt, currentBundle), 'BR6A_CERTIFIED_BUNDLE_REBUILD_MISMATCH');
  const artifacts = [
    artifact('approved-publication', 'certified-current-publication-input', values.paths.publication, [publication.inputDigest]),
    artifact('finance', 'validated-fec-finance-source', values.paths.finance, [finance.archiveDigest, finance.inputDigest]),
    artifact('congress', 'validated-congress-source', values.paths.congress, [congress.inputDigest]),
    artifact('historical-cvap', 'validated-history-and-cvap-source', values.paths.historicalCvap, [historicalCvap.sourceDigest, historicalCvap.inputDigest]),
    artifact('measure-registry', 'validated-statewide-measure-source', values.paths.measures, [measurePlan.planDigest]),
    artifact('current-bundle', 'certified-current-product-bundle', values.paths.currentBundle, [currentBundle.inputDigest, currentBundle.evidenceDigest, currentBundle.planDigest, currentBundle.bundleDigest]),
    artifact('historical-bundle', 'certified-historical-product-bundle', values.paths.historicalBundle, [historicalBundle.inputDigest, historicalBundle.evidenceDigest, historicalBundle.planDigest, historicalBundle.bundleDigest]),
    artifact('release-manifest', 'certified-release-manifest', values.paths.manifest, [manifestReceipt.receiptDigest]),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const links = [
    { from: 'approved-publication', to: 'finance', digest: publication.inputDigest, relation: 'source-input' },
    { from: 'finance', to: 'congress', digest: finance.inputDigest, relation: 'source-input' },
    { from: 'congress', to: 'historical-cvap', digest: congress.inputDigest, relation: 'source-input' },
    { from: 'historical-cvap', to: 'current-bundle', digest: historicalCvap.inputDigest, relation: 'source-input' },
    { from: 'current-bundle', to: 'release-manifest', digest: currentBundle.bundleDigest, relation: 'certified-artifact' },
    { from: 'historical-bundle', to: 'current-bundle', digest: currentBundle.bundleDigest, relation: 'byte-equivalent-bundle' },
  ];
  const base = { contract: 'g8-4br6a-lineage-catalog/v1' as const, artifacts, links, rebuiltBundleDigest: rebuilt.bundleDigest, currentHistoricalByteIdentical: readFileSync(values.paths.currentBundle).equals(readFileSync(values.paths.historicalBundle)) };
  expect(base.currentHistoricalByteIdentical, 'BR6A_CURRENT_HISTORICAL_FILE_DRIFT');
  const catalog: G8V2LineageCatalog = { ...base, catalogDigest: digest(base) };
  return { catalog, currentBundle, historicalBundle, publication };
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) { const value = key(item); counts.set(value, (counts.get(value) ?? 0) + 1); }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function completeCounts<const T extends readonly string[]>(labels: T, counts: Record<string, number>) {
  return Object.fromEntries(labels.map((label) => [label, counts[label] ?? 0])) as Record<T[number], number>;
}

function aggregateEntries(entries: G8V2DispositionEntry[]) {
  const rules = entries.flatMap((entry) => entry.pointerRules);
  return {
    plannedPaths: entries.length,
    duplicatePaths: entries.length - new Set(entries.map((entry) => entry.path)).size,
    omittedPaths: 858 - new Set(entries.map((entry) => entry.path)).size,
    byFamily: completeCounts(['races','measures','candidateResearch','measureResearch','metrics'] as const, countBy(entries, (entry) => entry.family)),
    byDisposition: completeCounts(['preserve-current','replace-with-certified','deterministic-merge','unresolved'] as const, countBy(entries, (entry) => entry.disposition)),
    byProvenanceClass: completeCounts(['current-certified-authoritative','existing-value-with-validated-source','runtime-metadata','identity-conflict','unsupported-production-only-value','ambiguous/unresolved'] as const, countBy(rules, (rule) => rule.provenanceClass)),
    byDifferenceKind: completeCounts(['reorder','identity','value','expected-only','production-only'] as const, countBy(rules, (rule) => rule.kind)),
    byPointerSignature: countBy(entries, (entry) => entry.pointerSignature),
    byBlockerClass: completeCounts(['none','identity-conflict','unsupported-production-only','conflicting-lineage','ambiguous-lineage'] as const, countBy(rules, (rule) => rule.blockerClass)),
    pointerRules: rules.length,
  };
}

function draftDisposition(conflict: G8V2ConflictDocument, rules: G8V2DispositionPointerRule[]) {
  const blocked = rules.some((rule) => rule.blockerClass !== 'none');
  if (blocked) return { disposition: 'unresolved' as const, output: conflict.actual, basis: 'no-op-unresolved' as const, rationale: 'one or more identity, lineage, or unsupported-production blockers remain; the draft proposes no change' };
  const productionPreserve = rules.filter((rule) => rule.kind === 'production-only' && ['existing-value-with-validated-source','runtime-metadata'].includes(rule.provenanceClass));
  const certifiedChanges = rules.some((rule) => rule.kind !== 'production-only' && ['current-certified-authoritative','runtime-metadata'].includes(rule.provenanceClass));
  if (productionPreserve.length > 0 && certifiedChanges) {
    const output = structuredClone(conflict.expected);
    for (const rule of productionPreserve) {
      const value = getPointer(conflict.actual, rule.pointer);
      expect(value !== undefined, 'BR6A_MERGE_SOURCE_POINTER_MISSING');
      setPointer(output, rule.pointer, value);
    }
    return { disposition: 'deterministic-merge' as const, output, basis: 'deterministic-merge' as const, rationale: 'certified expected fields are combined with only digest-matched sourced production-only values and preserved runtime metadata' };
  }
  if (certifiedChanges) return { disposition: 'replace-with-certified' as const, output: conflict.expected, basis: 'certified-output' as const, rationale: 'every differing pointer is resolved by the validated certified chain or deterministic runtime-envelope policy' };
  return { disposition: 'preserve-current' as const, output: conflict.actual, basis: 'preserved-current' as const, rationale: 'all differences are validated existing values or runtime metadata and no certified expected field is absent or changed' };
}

function nextEvidenceBatches(entries: G8V2DispositionEntry[]) {
  const groups = new Map<string, { family: G8V2ConflictFamily; blockerClass: G8V2DispositionBlockerClass; pointerSignature: string; paths: string[] }>();
  for (const entry of entries.filter((item) => item.disposition === 'unresolved')) {
    const blockers = sortedUnique(entry.pointerRules.filter((rule) => rule.blockerClass !== 'none').map((rule) => rule.blockerClass));
    for (const blockerClass of blockers as G8V2DispositionBlockerClass[]) {
      const key = `${entry.family}:${blockerClass}:${entry.pointerSignature}`;
      const group = groups.get(key) ?? { family: entry.family, blockerClass, pointerSignature: entry.pointerSignature, paths: [] };
      group.paths.push(entry.path); groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => {
    const paths = group.paths.sort();
    return { batchId: digest({ family: group.family, blockerClass: group.blockerClass, pointerSignature: group.pointerSignature, paths }).slice(0, 16), family: group.family, blockerClass: group.blockerClass, pointerSignature: group.pointerSignature, documents: paths.length, pathListDigest: digest(paths) };
  }).sort((left, right) => left.documents - right.documents || left.batchId.localeCompare(right.batchId));
}

export function buildG8V2DispositionPlan(options: {
  plan: G8V2ActivationPlan;
  snapshotValue: unknown;
  snapshotBytes: number;
  snapshotFileSha256: string;
  lineageValues: Parameters<typeof buildG8V2LineageCatalog>[0];
  extraSourceDocuments?: Array<{ artifactId: string; artifactDigest: string; documents: Map<string, Json> }>;
}): G8V2DispositionPlan {
  expect(options.snapshotBytes === 35_148_779 && options.snapshotFileSha256 === '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3', 'BR6A_SNAPSHOT_IDENTITY_MISMATCH');
  const snapshot = validateG8V2ConflictSnapshot(options.snapshotValue, options.plan) as G8V2ConflictSnapshot;
  expect(snapshot.conflicts.length === 858 && snapshot.counts.conflicting === 858 && snapshot.counts.unknown === 0, 'BR6A_CONFLICT_INVENTORY_MISMATCH');
  const { catalog, publication } = buildG8V2LineageCatalog(options.lineageValues);
  const artifactDigests = new Map(catalog.artifacts.map((item) => [item.id, item.semanticDigests]));
  artifactDigests.set('snapshot', [snapshot.digests.input, snapshot.digests.evidence, snapshot.digests.plan, options.snapshotFileSha256]);
  const publicationArtifact = catalog.artifacts.find((item) => item.id === 'approved-publication')!;
  const sourceDocuments = [{ artifactId: 'approved-publication', artifactDigest: publicationArtifact.semanticDigests[0], documents: rawPublicationDocuments(publication) }, ...(options.extraSourceDocuments ?? [])];
  const entries = [...snapshot.conflicts].sort((left, right) => left.path.localeCompare(right.path)).map((conflict) => {
    const differences = diffG8V2DispositionValues(conflict.actual, conflict.expected);
    expect(differences.length > 0, 'BR6A_EMPTY_CONFLICT_DIFF');
    const pointerRules = differences.map((difference) => classifyG8V2DispositionDifference({ difference, family: conflict.family, path: conflict.path, sourceDocuments, artifactDigests }));
    const drafted = draftDisposition(conflict, pointerRules);
    const evidenceDigests = sortedUnique([catalog.catalogDigest, snapshot.digests.evidence, ...pointerRules.flatMap((rule) => rule.evidenceDigests)]);
    const pointerSignature = digest(pointerRules.map((rule) => ({ pointer: pointerSignaturePointer(rule.pointer), kind: rule.kind, provenanceClass: rule.provenanceClass, blockerClass: rule.blockerClass })));
    return {
      path: conflict.path,
      family: conflict.family,
      disposition: drafted.disposition,
      safeToReplace: drafted.disposition !== 'unresolved' && pointerRules.every((rule) => rule.blockerClass === 'none'),
      pointerSignature,
      pointerRules,
      evidenceDigests,
      proposedOutputDigest: digest(drafted.output),
      proposedOutputBasis: drafted.basis,
      rollbackDigest: conflict.actualDigest,
      rollbackEvidence: 'complete-actual-document-in-immutable-br5b-snapshot' as const,
      rationale: drafted.rationale,
    };
  });
  expect(entries.length === 858 && new Set(entries.map((entry) => entry.path)).size === 858, 'BR6A_DUPLICATE_OR_OMITTED_PATH');
  const aggregate = aggregateEntries(entries);
  expect(aggregate.plannedPaths === 858 && aggregate.duplicatePaths === 0 && aggregate.omittedPaths === 0, 'BR6A_AGGREGATE_PATH_COVERAGE_MISMATCH');
  const unresolved = entries.filter((entry) => entry.disposition === 'unresolved').length;
  const policyConflicts = entries.flatMap((entry) => entry.pointerRules).filter((rule) => rule.blockerClass !== 'none').length;
  const readinessBase = {
    readyForExecutor: false,
    deterministicallyResolved: 858 - unresolved,
    unresolved,
    reproducibleOutputs: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.proposedOutputDigest)),
    rollbackEvidenceComplete: entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.rollbackDigest) && entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot'),
    policyConflicts,
    nextEvidenceBatches: nextEvidenceBatches(entries),
  };
  const readyForExecutor = unresolved === 0 && readinessBase.reproducibleOutputs && readinessBase.rollbackEvidenceComplete && policyConflicts === 0;
  const readiness = { ...readinessBase, readyForExecutor };
  const base = {
    schemaVersion: 1 as const,
    contract: G8_V2_DISPOSITION_CONTRACT,
    pointerContract: G8_V2_DISPOSITION_POINTER_CONTRACT,
    lineage: catalog,
    snapshot: { contract: snapshot.contract, bytes: options.snapshotBytes, fileSha256: options.snapshotFileSha256, inputDigest: snapshot.digests.input, evidenceDigest: snapshot.digests.evidence, planDigest: snapshot.digests.plan },
    policy: { currentProductionPresenceIsAuthority: false as const, inferenceCanSetSafeToReplace: false as const, productionOnlyDiscardRequiresRollbackEvidence: true as const, protectedFieldsRequireCertifiedV2Chain: true as const, sourcedFieldsRequireValidatedLineage: true as const },
    entries,
    aggregate,
    readiness,
    safety: { firebaseImported: false as const, credentialsLoaded: false as const, networkRequests: 0 as const, productionOperations: 0 as const },
  };
  const entriesDigest = digest(entries);
  const aggregateDigest = digest({ aggregate, readiness });
  return { ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest, plan: digest({ ...base, digests: { entries: entriesDigest, aggregate: aggregateDigest } }) } };
}

export function loadG8V2DispositionPlan(paths: G8V2DispositionPaths, plan: G8V2ActivationPlan) {
  const snapshotBuffer = readFileSync(paths.snapshot);
  const lineageValues = {
    paths: { currentBundle: paths.currentBundle, historicalBundle: paths.historicalBundle, manifest: paths.manifest, publication: paths.publication, finance: paths.finance, congress: paths.congress, historicalCvap: paths.historicalCvap, measures: paths.measures },
    currentBundle: json(paths.currentBundle), historicalBundle: json(paths.historicalBundle), manifest: json(paths.manifest), publication: json(paths.publication), finance: json(paths.finance), congress: json(paths.congress), historicalCvap: json(paths.historicalCvap), measures: json(paths.measures),
  };
  return buildG8V2DispositionPlan({ plan, snapshotValue: JSON.parse(snapshotBuffer.toString('utf8')) as unknown, snapshotBytes: snapshotBuffer.length, snapshotFileSha256: createHash('sha256').update(snapshotBuffer).digest('hex'), lineageValues });
}

export function buildG8V2DispositionAggregateReport(plan: G8V2DispositionPlan) {
  return {
    schemaVersion: 1,
    contract: G8_V2_DISPOSITION_REPORT_CONTRACT,
    operation: 'g8-4br6a-offline-conflict-disposition-plan',
    lineage: { catalogDigest: plan.lineage.catalogDigest, rebuiltBundleDigest: plan.lineage.rebuiltBundleDigest, acceptedArtifacts: plan.lineage.artifacts.length, currentHistoricalByteIdentical: plan.lineage.currentHistoricalByteIdentical },
    snapshot: plan.snapshot,
    aggregate: plan.aggregate,
    readiness: plan.readiness,
    safety: plan.safety,
    digests: plan.digests,
  };
}

export function verifyG8V2DispositionReplay(first: Pick<G8V2DispositionPlan, 'digests'>, second: Pick<G8V2DispositionPlan, 'digests'>) {
  expect(first.digests.entries === second.digests.entries && first.digests.aggregate === second.digests.aggregate && first.digests.plan === second.digests.plan, 'BR6A_NONDETERMINISTIC_REPLAY');
  return true;
}
