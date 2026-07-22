import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../../ingest/src/federalRegistry.js';
import {
  buildCanonicalMigrationReport,
  buildCanonicalShadowPlan,
  encodeFirestoreSnapshotValue,
  type CanonicalMigrationSnapshot,
  type FirestoreTimestampTag,
} from './canonicalMigration.js';

type JsonRecord = Record<string, unknown>;
type ShadowStatus = 'running' | 'completed';

export const CANONICAL_SHADOW_GENERATION = 'canonical-2026-shadow-v1';
export const CANONICAL_SHADOW_NAMESPACE = `migrationShadows/${CANONICAL_SHADOW_GENERATION}`;
export const CERTIFIED_CANONICAL_SHADOW = {
  projectId: 'politipiks',
  databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a',
  inputDigest: 'd37f86d5dfdb168a1e98b190b61b00f0def1303175cafedfa578403f07e604eb',
  mappingDigest: '7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a',
  planDigest: '79e6d71411c675f01508618cbb138551d4c9f4f7cf9508f2d66d62d780dad7b0',
  expectedRaces: 470,
  expectedResearch: 537,
  expectedMetrics: 35,
} as const;

export type ShadowDocument = { path: string; data: JsonRecord };
export type ShadowWrite = { operation: 'create' | 'set'; path: string; data: JsonRecord };
export type ShadowDocumentStore = {
  get(path: string): Promise<JsonRecord | null>;
  list(collectionPath: string): Promise<ShadowDocument[]>;
  commit(writes: ShadowWrite[]): Promise<void>;
};

export type CanonicalShadowWritePlan = {
  generation: typeof CANONICAL_SHADOW_GENERATION;
  sourceCommit: string;
  snapshot: { schemaVersion: 2; projectId: string; databaseId: string; inputDigest: string };
  mappingDigest: string;
  planDigest: string;
  expectedCounts: { races: number; research: number; metrics: number };
  documents: ShadowDocument[];
};

const rootPath = CANONICAL_SHADOW_NAMESPACE;
const racesCollectionPath = `${rootPath}/races`;
const metricsCollectionPath = `${rootPath}/contestMetrics`;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const encodeForComparison = (value: unknown) => encodeFirestoreSnapshotValue(value);
const sameData = (left: unknown, right: unknown) => canonicalJson(encodeForComparison(left)) === canonicalJson(encodeForComparison(right));

function assertPathInShadowNamespace(path: string) {
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) throw new Error(`unsafe active-namespace path: ${path}`);
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error(`unsafe shadow path: ${path}`);
  if (!path.startsWith('migrationShadows/')) throw new Error(`unsafe active-namespace path: ${path}`);
}

function assertUniqueDocuments(documents: ShadowDocument[]) {
  const seen = new Set<string>();
  for (const document of documents) {
    assertPathInShadowNamespace(document.path);
    if (seen.has(document.path)) throw new Error(`conflicting shadow target: ${document.path}`);
    seen.add(document.path);
  }
}

function assertCanonicalShadowWritePlan(plan: CanonicalShadowWritePlan) {
  if (plan.generation !== CANONICAL_SHADOW_GENERATION || plan.snapshot.schemaVersion !== 2
    || plan.snapshot.projectId !== CERTIFIED_CANONICAL_SHADOW.projectId || plan.snapshot.databaseId !== CERTIFIED_CANONICAL_SHADOW.databaseId
    || plan.snapshot.inputDigest !== CERTIFIED_CANONICAL_SHADOW.inputDigest || plan.mappingDigest !== CERTIFIED_CANONICAL_SHADOW.mappingDigest
    || plan.planDigest !== CERTIFIED_CANONICAL_SHADOW.planDigest || !/^[0-9a-f]{7,64}$/i.test(plan.sourceCommit)) throw new Error('non-certified shadow write plan');
  if (plan.expectedCounts.races !== CERTIFIED_CANONICAL_SHADOW.expectedRaces || plan.expectedCounts.research !== CERTIFIED_CANONICAL_SHADOW.expectedResearch
    || plan.expectedCounts.metrics !== CERTIFIED_CANONICAL_SHADOW.expectedMetrics) throw new Error('unexpected shadow document counts');
  const counts = { races: 0, research: 0, metrics: 0 };
  for (const document of plan.documents) {
    if (new RegExp(`^${racesCollectionPath}/[^/]+$`).test(document.path)) counts.races += 1;
    else if (new RegExp(`^${racesCollectionPath}/[^/]+/candidateResearch/[^/]+$`).test(document.path)) counts.research += 1;
    else if (new RegExp(`^${metricsCollectionPath}/[^/]+$`).test(document.path)) counts.metrics += 1;
    else throw new Error(`unsafe active-namespace path: ${document.path}`);
  }
  if (!sameData(counts, plan.expectedCounts)) throw new Error('unexpected shadow document counts');
  assertUniqueDocuments(plan.documents);
}

/** The certified digest triplet is an explicit release boundary, not caller-controlled input. */
export function assertCertifiedCanonicalSnapshot(report: {
  inputDigest: string;
  mappingDigest: string;
  planDigest: string;
  safeToActivate: boolean;
  canonicalVotingFederalSeatCount?: number;
  mappings?: { races: number; candidates: number };
  copyPlan?: { candidateResearch: number; mergedCandidateResearchDocuments: number; contestMetrics: number; researchConflicts: unknown[] };
  unresolved?: { races: unknown[]; candidateCount: number; orphanedPredictions: unknown[]; retiredContestPredictions: unknown[]; ambiguousReferences: unknown[] };
}) {
  if (report.inputDigest !== CERTIFIED_CANONICAL_SHADOW.inputDigest
    || report.mappingDigest !== CERTIFIED_CANONICAL_SHADOW.mappingDigest
    || report.planDigest !== CERTIFIED_CANONICAL_SHADOW.planDigest
    || report.safeToActivate !== true) throw new Error('non-certified snapshot or unresolved canonical plan');
  if (report.canonicalVotingFederalSeatCount !== undefined && report.canonicalVotingFederalSeatCount !== CERTIFIED_CANONICAL_SHADOW.expectedRaces) {
    throw new Error('unexpected canonical voting seat count');
  }
  if (report.mappings && (report.mappings.races !== 35 || report.mappings.candidates !== 2385)) throw new Error('unexpected certified mapping counts');
  if (report.copyPlan && (report.copyPlan.candidateResearch !== 538 || report.copyPlan.mergedCandidateResearchDocuments !== CERTIFIED_CANONICAL_SHADOW.expectedResearch
    || report.copyPlan.contestMetrics !== CERTIFIED_CANONICAL_SHADOW.expectedMetrics || report.copyPlan.researchConflicts.length !== 0)) throw new Error('unexpected certified copy-plan counts');
  if (report.unresolved && (report.unresolved.races.length !== 0 || report.unresolved.candidateCount !== 0 || report.unresolved.orphanedPredictions.length !== 0
    || report.unresolved.retiredContestPredictions.length !== 0 || report.unresolved.ambiguousReferences.length !== 0)) throw new Error('unresolved canonical plan');
}

/** Produces the only documents this release candidate is ever allowed to create. */
export function buildCanonicalShadowWritePlan(snapshot: CanonicalMigrationSnapshot, sourceCommit: string): CanonicalShadowWritePlan {
  if (!/^[0-9a-f]{7,64}$/i.test(sourceCommit)) throw new Error('source commit must be a git commit hash');
  const report = buildCanonicalMigrationReport(snapshot);
  assertCertifiedCanonicalSnapshot(report);
  const sourcePlan = buildCanonicalShadowPlan(snapshot.inputs);
  if (!sourcePlan.safeToActivate) throw new Error('unresolved canonical plan');
  const raceSources = new Map(sourcePlan.shadowContests.map((contest) => [contest.id, contest.legacySources]));
  const raceDocuments: ShadowDocument[] = CANONICAL_2026_FEDERAL_CONTESTS.map((contest) => ({
    path: `${racesCollectionPath}/${contest.id}`,
    data: { ...contest, canonicalShadow: { generation: CANONICAL_SHADOW_GENERATION, legacySources: raceSources.get(contest.id) ?? [] } },
  }));
  const researchDocuments: ShadowDocument[] = sourcePlan.researchMerge.documents.map((research) => ({
    path: `${racesCollectionPath}/${research.raceId}/candidateResearch/${research.candidateId}`,
    data: { ...research.data, canonicalShadow: { generation: CANONICAL_SHADOW_GENERATION, targetRaceId: research.raceId, targetCandidateId: research.candidateId } },
  }));
  const metricDocuments: ShadowDocument[] = sourcePlan.contestMetricCopies.map((metric) => ({
    path: `${metricsCollectionPath}/${metric.targetRaceId}`,
    data: {
      ...metric.data,
      raceId: metric.targetRaceId,
      canonicalShadow: { generation: CANONICAL_SHADOW_GENERATION, sourceMetricId: metric.id, sourceRaceId: metric.raceId },
    },
  }));
  const documents = [...raceDocuments, ...researchDocuments, ...metricDocuments].sort((left, right) => left.path.localeCompare(right.path));
  assertUniqueDocuments(documents);
  documents.forEach((document) => assertFirestoreWritePrecision(document.data));
  const expectedCounts = { races: raceDocuments.length, research: researchDocuments.length, metrics: metricDocuments.length };
  if (expectedCounts.races !== CERTIFIED_CANONICAL_SHADOW.expectedRaces || expectedCounts.research !== CERTIFIED_CANONICAL_SHADOW.expectedResearch
    || expectedCounts.metrics !== CERTIFIED_CANONICAL_SHADOW.expectedMetrics) throw new Error('unexpected shadow document counts');
  const writePlan: CanonicalShadowWritePlan = {
    generation: CANONICAL_SHADOW_GENERATION,
    sourceCommit,
    snapshot: { schemaVersion: snapshot.schemaVersion, projectId: snapshot.projectId, databaseId: snapshot.databaseId, inputDigest: report.inputDigest },
    mappingDigest: report.mappingDigest,
    planDigest: report.planDigest,
    expectedCounts,
    documents,
  };
  assertCanonicalShadowWritePlan(writePlan);
  return writePlan;
}

function rootIdentity(plan: CanonicalShadowWritePlan) {
  return {
    schemaVersion: plan.snapshot.schemaVersion,
    generation: plan.generation,
    projectId: plan.snapshot.projectId,
    databaseId: plan.snapshot.databaseId,
    inputDigest: plan.snapshot.inputDigest,
    mappingDigest: plan.mappingDigest,
    planDigest: plan.planDigest,
    expectedCounts: plan.expectedCounts,
    sourceCommit: plan.sourceCommit,
  };
}

function rootDocument(plan: CanonicalShadowWritePlan, status: ShadowStatus, completedDocuments: number, completedBatches: number, startedAt: string, completedAt?: string): JsonRecord {
  const totalBatches = Math.ceil(plan.documents.length / 399);
  return {
    ...rootIdentity(plan),
    status,
    actualCounts: plan.expectedCounts,
    startedAt,
    ...(completedAt ? { completedAt } : {}),
    batchProgress: { totalDocuments: plan.documents.length, completedDocuments, totalBatches, completedBatches },
  };
}

function assertCompatibleRoot(existing: JsonRecord, plan: CanonicalShadowWritePlan) {
  for (const [key, value] of Object.entries(rootIdentity(plan))) {
    if (!sameData(existing[key], value)) throw new Error(`conflicting shadow generation metadata: ${key}`);
  }
  if (existing.status !== 'running' && existing.status !== 'completed') throw new Error('invalid shadow generation status');
}

function assertExistingDocument(path: string, existing: JsonRecord | null, expected: JsonRecord) {
  if (existing !== null && !sameData(existing, expected)) throw new Error(`conflicting existing shadow content: ${path}`);
}

function assertFirestoreWritePrecision(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertFirestoreWritePrecision); return; }
  if (!isRecord(value)) return;
  if (value.__firestoreType === 'timestamp/v1') {
    const tag = value as FirestoreTimestampTag;
    if (!Number.isInteger(tag.seconds) || !Number.isInteger(tag.nanoseconds) || tag.nanoseconds % 1_000 !== 0) {
      throw new Error('timestamp/v1 tag cannot round-trip through Firestore microsecond precision');
    }
    return;
  }
  Object.values(value).forEach(assertFirestoreWritePrecision);
}

/** Applies only pre-built shadow paths. It never derives or accepts an active collection path. */
export async function executeCanonicalShadowWritePlan(
  store: ShadowDocumentStore,
  plan: CanonicalShadowWritePlan,
  now: () => string = () => new Date().toISOString(),
) {
  assertCanonicalShadowWritePlan(plan);
  plan.documents.forEach((document) => assertFirestoreWritePrecision(document.data));
  const existingRoot = await store.get(rootPath);
  if (existingRoot) assertCompatibleRoot(existingRoot, plan);
  const existingDocuments = await Promise.all(plan.documents.map(async (document) => ({ document, existing: await store.get(document.path) })));
  for (const { document, existing } of existingDocuments) assertExistingDocument(document.path, existing, document.data);
  const pending = existingDocuments.filter((item) => item.existing === null).map((item) => item.document);
  if (existingRoot?.status === 'completed') {
    if (pending.length > 0) throw new Error('completed shadow generation is missing expected documents');
    return { applied: false, resumed: false, batches: 0, documentsWritten: 0, status: 'completed' as const };
  }
  const startedAt = typeof existingRoot?.startedAt === 'string' ? existingRoot.startedAt : now();
  let completedDocuments = plan.documents.length - pending.length;
  let completedBatches = Number((existingRoot?.batchProgress as JsonRecord | undefined)?.completedBatches ?? 0);
  const chunks = Array.from({ length: Math.ceil(pending.length / 399) }, (_, index) => pending.slice(index * 399, (index + 1) * 399));
  for (const chunk of chunks) {
    completedDocuments += chunk.length;
    completedBatches += 1;
    const root = rootDocument(plan, 'running', completedDocuments, completedBatches, startedAt);
    const rootOperation: ShadowWrite = { operation: existingRoot || completedBatches > 1 ? 'set' : 'create', path: rootPath, data: root };
    const writes: ShadowWrite[] = [rootOperation, ...chunk.map((document) => ({ operation: 'create' as const, path: document.path, data: document.data }))];
    if (writes.length > 400) throw new Error('shadow batch exceeds 400 writes');
    await store.commit(writes);
  }
  const completion = rootDocument(plan, 'completed', plan.documents.length, completedBatches, startedAt, now());
  await store.commit([{ operation: existingRoot || chunks.length > 0 ? 'set' : 'create', path: rootPath, data: completion }]);
  return { applied: true, resumed: existingRoot !== null, batches: chunks.length + 1, documentsWritten: pending.length, status: 'completed' as const };
}

/** Reads and hashes the completed shadow generation. It performs no writes. */
export async function verifyCanonicalShadowNamespace(store: ShadowDocumentStore, plan: CanonicalShadowWritePlan) {
  assertCanonicalShadowWritePlan(plan);
  const root = await store.get(rootPath);
  if (!root) throw new Error('shadow generation is absent');
  assertCompatibleRoot(root, plan);
  if (root.status !== 'completed') throw new Error('shadow generation is not completed');
  const raceDocuments = await store.list(racesCollectionPath);
  const metricDocuments = await store.list(metricsCollectionPath);
  const expectedByPath = new Map(plan.documents.map((document) => [document.path, document.data]));
  const actual: ShadowDocument[] = [...raceDocuments, ...metricDocuments];
  const raceIds = raceDocuments.map((document) => document.path.split('/').at(-1) ?? '').sort();
  for (const raceId of raceIds) actual.push(...await store.list(`${racesCollectionPath}/${raceId}/candidateResearch`));
  const actualByPath = new Map(actual.map((document) => [document.path, document.data]));
  if (actualByPath.size !== expectedByPath.size) throw new Error('shadow namespace document count differs from the certified plan');
  for (const [path, expected] of expectedByPath) {
    const found = actualByPath.get(path);
    if (!found) throw new Error(`shadow namespace is missing ${path}`);
    if (!sameData(found, expected)) throw new Error(`conflicting existing shadow content: ${path}`);
  }
  return { verified: true, namespaceDigest: digest({ root: encodeForComparison(root), documents: [...actualByPath.entries()].sort(([left], [right]) => left.localeCompare(right)) }), counts: plan.expectedCounts };
}

/** Returns the checked-out commit and rejects only uncommitted executor inputs, preserving unrelated dirty work. */
export function getCommittedExecutorSource(): string {
  const sourceFiles = [
    'package.json',
    'scripts/apply-canonical-shadow.ts',
    'scripts/lib/canonicalShadowCli.ts',
    'scripts/lib/canonicalShadowExecutor.ts',
    'scripts/lib/canonicalMigration.ts',
    'scripts/lib/canonicalShadowExecutor.test.ts',
  ];
  const status = execFileSync('git', ['status', '--porcelain', '--', ...sourceFiles], { encoding: 'utf8' }).trim();
  if (status) throw new Error('uncommitted migration implementation');
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function decodeTimestampTags(value: unknown, timestamp: (seconds: number, nanoseconds: number) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeTimestampTags(item, timestamp));
  if (isRecord(value)) {
    if (value.__firestoreType === 'timestamp/v1') {
      const tag = value as FirestoreTimestampTag;
      // Firestore persists timestamps at microsecond precision. A snapshot
      // originates from Firestore, so accepting finer precision here would
      // silently change it on write; reject rather than lossy-coerce.
      if (tag.nanoseconds % 1_000 !== 0) throw new Error('timestamp/v1 tag cannot round-trip through Firestore microsecond precision');
      return timestamp(tag.seconds, tag.nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeTimestampTags(item, timestamp)]));
  }
  return value;
}

/** The sole write adapter; Timestamp tags are decoded only immediately before a Firestore batch write. */
export async function createFirestoreCanonicalShadowStore() {
  const [{ bootstrapFirestore }, { Timestamp }] = await Promise.all([
    import('./firestoreCli.js'),
    import('@google-cloud/firestore'),
  ]);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== CERTIFIED_CANONICAL_SHADOW.projectId || databaseId !== CERTIFIED_CANONICAL_SHADOW.databaseId) throw new Error('unexpected Firestore target');
  const toDocument = (path: string) => {
    assertPathInShadowNamespace(path);
    return db.doc(path);
  };
  const toCollection = (path: string) => {
    assertPathInShadowNamespace(path);
    return db.collection(path);
  };
  const store: ShadowDocumentStore = {
    async get(path) {
      const document = await toDocument(path).get();
      return document.exists ? encodeFirestoreSnapshotValue(document.data(), path) as JsonRecord : null;
    },
    async list(collectionPath) {
      const snapshot = await toCollection(collectionPath).get();
      return snapshot.docs.map((document) => ({ path: document.ref.path, data: encodeFirestoreSnapshotValue(document.data(), document.ref.path) as JsonRecord }));
    },
    async commit(writes) {
      if (writes.length === 0 || writes.length > 400) throw new Error('shadow batch must contain 1 to 400 writes');
      const batch = db.batch();
      for (const write of writes) {
        const data = decodeTimestampTags(write.data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds));
        if (write.operation === 'create') batch.create(toDocument(write.path), data);
        else batch.set(toDocument(write.path), data);
      }
      await batch.commit();
    },
  };
  return store;
}
