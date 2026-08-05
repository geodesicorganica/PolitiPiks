import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  validateLocalProductBundle,
  type LocalProductBundle,
  type LocalProductDocument,
} from './localProductBundle.js';
import { encodeFirestoreSnapshotValue, type FirestoreTimestampTag } from './canonicalMigration.js';

type JsonRecord = Record<string, unknown>;
type ShadowStatus = 'running' | 'completed';
type FirestoreCollectionLike = { listDocuments(): Promise<FirestoreDocumentReferenceLike[]> };
type FirestoreDocumentReferenceLike = { path: string; get(): Promise<{ exists: boolean; data(): JsonRecord | undefined }>; listCollections(): Promise<FirestoreCollectionLike[]> };

export const G8_PRODUCT_SHADOW_GENERATION = 'canonical-2026-shadow-v2';
export const G8_PRODUCT_SHADOW_NAMESPACE = `migrationShadows/${G8_PRODUCT_SHADOW_GENERATION}`;
export const G8_PRODUCT_SHADOW_ROOT = G8_PRODUCT_SHADOW_NAMESPACE;
export const CERTIFIED_G8_PRODUCT_SHADOW = {
  projectId: 'politipiks',
  databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a',
  generation: G8_PRODUCT_SHADOW_GENERATION,
  inputDigest: 'af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830',
  evidenceDigest: 'f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f',
  planDigest: '15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641',
  bundleDigest: '7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7',
  expectedCounts: {
    races: 470,
    measures: 14,
    candidateResearch: 2384,
    measureResearch: 14,
    metrics: 470,
    contentDocuments: 3352,
    totalBundleDocuments: 3353,
    selectorsExcluded: 1,
  },
} as const;

export type G8ProductShadowCounts = {
  races: number;
  measures: number;
  candidateResearch: number;
  measureResearch: number;
  metrics: number;
  contentDocuments: number;
  totalBundleDocuments: number;
  selectorsExcluded: number;
};
export type ShadowDocument = { path: string; data: JsonRecord };
export type ShadowWrite = { operation: 'create' | 'set'; path: string; data: JsonRecord };
export type ShadowDocumentStore = {
  get(path: string): Promise<JsonRecord | null>;
  list(collectionPath: string): Promise<ShadowDocument[]>;
  listNamespace?(): Promise<ShadowDocument[]>;
  commit(writes: ShadowWrite[]): Promise<void>;
};

export type G8ProductShadowWritePlan = {
  generation: typeof G8_PRODUCT_SHADOW_GENERATION;
  sourceCommit: string;
  target: { projectId: string; databaseId: string };
  certifiedDigests: { input: string; evidence: string; plan: string; bundle: string };
  expectedCounts: G8ProductShadowCounts;
  namespaceDigest: string;
  documents: ShadowDocument[];
};

const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('unsupported shadow value');
  return encoded;
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const encodeForComparison = (value: unknown) => encodeFirestoreSnapshotValue(value);
const sameData = (left: unknown, right: unknown) => canonicalJson(encodeForComparison(left)) === canonicalJson(encodeForComparison(right));

function assertShadowPath(path: string) {
  if (path !== G8_PRODUCT_SHADOW_NAMESPACE && !path.startsWith(`${G8_PRODUCT_SHADOW_NAMESPACE}/`)) throw new Error(`unsafe active-namespace path: ${path}`);
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) throw new Error(`unsafe shadow path: ${path}`);
  if (!path.startsWith('migrationShadows/')) throw new Error(`unsafe active-namespace path: ${path}`);
}

function assertUniqueDocuments(documents: ShadowDocument[]) {
  const seen = new Set<string>();
  for (const document of documents) {
    assertShadowPath(document.path);
    if (seen.has(document.path)) throw new Error(`duplicate shadow path: ${document.path}`);
    seen.add(document.path);
  }
}

function assertFirestoreWritePrecision(value: unknown, at = 'document') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFirestoreWritePrecision(item, `${at}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  if (value.__firestoreType === 'timestamp/v1') {
    const tag = value as Partial<FirestoreTimestampTag>;
    if (!Number.isInteger(tag.seconds) || !Number.isInteger(tag.nanoseconds) || (tag.nanoseconds as number) < 0
      || (tag.nanoseconds as number) >= 1_000_000_000 || (tag.nanoseconds as number) % 1_000 !== 0) {
      throw new Error(`timestamp/v1 tag cannot round-trip through Firestore microsecond precision at ${at}`);
    }
    if (Object.keys(value).some((key) => !['__firestoreType', 'seconds', 'nanoseconds'].includes(key))) throw new Error(`malformed timestamp/v1 tag at ${at}`);
    return;
  }
  Object.entries(value).forEach(([key, child]) => assertFirestoreWritePrecision(child, `${at}.${key}`));
}

function classifySourcePath(path: string): 'races' | 'measures' | 'candidateResearch' | 'measureResearch' | 'metrics' | 'selector' {
  if (/^races\/[^/]+$/.test(path)) return 'races';
  if (/^ballotMeasures\/[^/]+$/.test(path)) return 'measures';
  if (/^races\/[^/]+\/candidateResearch\/[^/]+$/.test(path)) return 'candidateResearch';
  if (/^ballotMeasures\/[^/]+\/research\/baseline$/.test(path)) return 'measureResearch';
  if (/^contestMetrics\/[^/]+$/.test(path)) return 'metrics';
  if (path === 'catalogActivations/canonical-2026') return 'selector';
  throw new Error(`unsupported product bundle path: ${path}`);
}

function mapSourceDocument(document: LocalProductDocument): ShadowDocument | null {
  const kind = classifySourcePath(document.path);
  if (kind === 'selector') return null;
  const target = `${G8_PRODUCT_SHADOW_NAMESPACE}/${document.path}`;
  assertShadowPath(target);
  return { path: target, data: structuredClone(document.data) };
}

function assertCertifiedBundle(bundle: LocalProductBundle) {
  if (bundle.generation !== G8_PRODUCT_SHADOW_GENERATION) throw new Error('v1 or unknown bundle generation is not accepted');
  if (bundle.inputDigest !== CERTIFIED_G8_PRODUCT_SHADOW.inputDigest || bundle.evidenceDigest !== CERTIFIED_G8_PRODUCT_SHADOW.evidenceDigest
    || bundle.planDigest !== CERTIFIED_G8_PRODUCT_SHADOW.planDigest || bundle.bundleDigest !== CERTIFIED_G8_PRODUCT_SHADOW.bundleDigest) {
    throw new Error('stale or mismatched certified bundle digest');
  }
  if (!sameData(bundle.counts, { races: 470, measures: 14, candidateResearch: 2384, measureResearch: 14, metrics: 470, selectors: 1, total: 3353 })) throw new Error('stale or mismatched certified bundle counts');
  if (bundle.documents.filter((document) => classifySourcePath(document.path) === 'selector').length !== 1) throw new Error('certified bundle must contain exactly one selector');
  if (!bundle.documents.some((document) => document.path === 'catalogActivations/canonical-2026')) throw new Error('certified selector is absent');
}

function deriveCounts(documents: ShadowDocument[]): G8ProductShadowCounts {
  const counts = {
    races: documents.filter((document) => /\/races\/[^/]+$/.test(document.path)).length,
    measures: documents.filter((document) => /\/ballotMeasures\/[^/]+$/.test(document.path)).length,
    candidateResearch: documents.filter((document) => /\/races\/[^/]+\/candidateResearch\/[^/]+$/.test(document.path)).length,
    measureResearch: documents.filter((document) => /\/ballotMeasures\/[^/]+\/research\/baseline$/.test(document.path)).length,
    metrics: documents.filter((document) => /\/contestMetrics\/[^/]+$/.test(document.path)).length,
  };
  return { ...counts, contentDocuments: documents.length, totalBundleDocuments: 3353, selectorsExcluded: 1 };
}

function contentDigest(documents: ShadowDocument[]) {
  return digest(documents.map((document) => [document.path, encodeForComparison(document.data)]).sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function assertPlan(plan: G8ProductShadowWritePlan) {
  if (plan.generation !== G8_PRODUCT_SHADOW_GENERATION || plan.target.projectId !== CERTIFIED_G8_PRODUCT_SHADOW.projectId
    || plan.target.databaseId !== CERTIFIED_G8_PRODUCT_SHADOW.databaseId || !/^[a-f0-9]{7,64}$/i.test(plan.sourceCommit)) throw new Error('non-certified v2 shadow write plan');
  if (!sameData(plan.certifiedDigests, { input: CERTIFIED_G8_PRODUCT_SHADOW.inputDigest, evidence: CERTIFIED_G8_PRODUCT_SHADOW.evidenceDigest, plan: CERTIFIED_G8_PRODUCT_SHADOW.planDigest, bundle: CERTIFIED_G8_PRODUCT_SHADOW.bundleDigest })) throw new Error('non-certified v2 shadow digests');
  if (!sameData(plan.expectedCounts, CERTIFIED_G8_PRODUCT_SHADOW.expectedCounts)) throw new Error('unexpected v2 shadow document counts');
  assertUniqueDocuments(plan.documents);
  if (plan.documents.some((document) => /\/catalogActivations(?:\/|$)/.test(document.path))) throw new Error('selector is not an allowed v2 shadow document');
  const derived = deriveCounts(plan.documents);
  if (!sameData(derived, plan.expectedCounts)) throw new Error('unexpected v2 shadow document counts');
  plan.documents.forEach((document) => assertFirestoreWritePrecision(document.data, document.path));
  if (contentDigest(plan.documents) !== plan.namespaceDigest) throw new Error('v2 shadow namespace digest mismatch');
}

/** Maps only certified bundle content under the v2 shadow namespace; the active selector is never mapped. */
export function buildG8ProductShadowWritePlan(bundleValue: unknown, sourceCommit: string): G8ProductShadowWritePlan {
  const bundle = validateLocalProductBundle(bundleValue);
  assertCertifiedBundle(bundle);
  if (!/^[a-f0-9]{7,64}$/i.test(sourceCommit)) throw new Error('source commit must be a git commit hash');
  const documents = bundle.documents.map(mapSourceDocument).filter((document): document is ShadowDocument => document !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
  const plan: G8ProductShadowWritePlan = {
    generation: G8_PRODUCT_SHADOW_GENERATION,
    sourceCommit,
    target: { projectId: CERTIFIED_G8_PRODUCT_SHADOW.projectId, databaseId: CERTIFIED_G8_PRODUCT_SHADOW.databaseId },
    certifiedDigests: { input: bundle.inputDigest, evidence: bundle.evidenceDigest, plan: bundle.planDigest, bundle: bundle.bundleDigest },
    expectedCounts: { ...CERTIFIED_G8_PRODUCT_SHADOW.expectedCounts },
    namespaceDigest: contentDigest(documents),
    documents,
  };
  assertPlan(plan);
  return plan;
}

function rootIdentity(plan: G8ProductShadowWritePlan) {
  return {
    schemaVersion: 1,
    kind: 'g8-product-shadow-root-manifest',
    projectId: plan.target.projectId,
    databaseId: plan.target.databaseId,
    generation: plan.generation,
    sourceCommit: plan.sourceCommit,
    certifiedDigests: plan.certifiedDigests,
    expectedCounts: plan.expectedCounts,
    namespaceDigest: plan.namespaceDigest,
  };
}

export function buildG8ProductShadowRootManifest(plan: G8ProductShadowWritePlan, status: ShadowStatus, completedDocuments: number, completedBatches: number, startedAt: string, completedAt?: string): JsonRecord {
  assertPlan(plan);
  const contentBatches = Math.ceil(plan.documents.length / 399);
  if (!Number.isInteger(completedDocuments) || completedDocuments < 0 || completedDocuments > plan.documents.length
    || !Number.isInteger(completedBatches) || completedBatches < 0 || completedBatches > contentBatches + 1) throw new Error('invalid v2 shadow batch progress');
  return {
    ...rootIdentity(plan),
    status,
    startedAt,
    ...(completedAt ? { completedAt } : {}),
    batchProgress: { totalDocuments: plan.documents.length, totalBatches: contentBatches + 1, completedDocuments, completedBatches },
  };
}

function assertCompatibleRoot(existing: JsonRecord, plan: G8ProductShadowWritePlan) {
  for (const [key, value] of Object.entries(rootIdentity(plan))) if (!sameData(existing[key], value)) throw new Error(`conflicting shadow root manifest: ${key}`);
  if (existing.status !== 'running' && existing.status !== 'completed') throw new Error('invalid v2 shadow root status');
  const progress = existing.batchProgress;
  if (!isRecord(progress) || progress.totalDocuments !== plan.documents.length || progress.totalBatches !== Math.ceil(plan.documents.length / 399) + 1
    || !Number.isInteger(progress.completedDocuments) || !Number.isInteger(progress.completedBatches)) throw new Error('invalid v2 shadow batch progress');
}

function assertExistingDocument(path: string, existing: JsonRecord | null, expected: JsonRecord) {
  if (existing !== null && !sameData(existing, expected)) throw new Error(`conflicting existing shadow content: ${path}`);
}

/** Creates content only, with an atomic root-progress operation in every batch. */
export async function executeG8ProductShadowWritePlan(store: ShadowDocumentStore, plan: G8ProductShadowWritePlan, now: () => string = () => new Date().toISOString()) {
  assertPlan(plan);
  const existingRoot = await store.get(G8_PRODUCT_SHADOW_ROOT);
  if (existingRoot) assertCompatibleRoot(existingRoot, plan);
  const existingDocuments = await Promise.all(plan.documents.map(async (document) => ({ document, existing: await store.get(document.path) })));
  for (const item of existingDocuments) assertExistingDocument(item.document.path, item.existing, item.document.data);
  const pending = existingDocuments.filter((item) => item.existing === null).map((item) => item.document);
  if (existingRoot?.status === 'completed') {
    if (pending.length > 0) throw new Error('completed v2 shadow is missing expected documents');
    return { applied: false, resumed: false, batches: 0, documentsWritten: 0, contentDocuments: plan.documents.length, status: 'completed' as const };
  }
  const startedAt = existingRoot && typeof existingRoot.startedAt === 'string' ? existingRoot.startedAt : now();
  let completedBatches = existingRoot ? Number((existingRoot.batchProgress as JsonRecord).completedBatches) : 0;
  const chunks = Array.from({ length: Math.ceil(pending.length / 399) }, (_, index) => pending.slice(index * 399, (index + 1) * 399));
  let completedDocuments = plan.documents.length - pending.length;
  for (const chunk of chunks) {
    completedDocuments += chunk.length;
    completedBatches += 1;
    const root = buildG8ProductShadowRootManifest(plan, 'running', completedDocuments, completedBatches, startedAt);
    const writes: ShadowWrite[] = [{ operation: existingRoot || completedBatches > 1 ? 'set' : 'create', path: G8_PRODUCT_SHADOW_ROOT, data: root }, ...chunk.map((document) => ({ operation: 'create' as const, path: document.path, data: document.data }))];
    if (writes.length > 400) throw new Error('v2 shadow batch exceeds 400 operations');
    await store.commit(writes);
  }
  const completion = buildG8ProductShadowRootManifest(plan, 'completed', plan.documents.length, completedBatches + 1, startedAt, now());
  await store.commit([{ operation: existingRoot || chunks.length > 0 ? 'set' : 'create', path: G8_PRODUCT_SHADOW_ROOT, data: completion }]);
  return { applied: true, resumed: existingRoot !== null, batches: chunks.length + 1, documentsWritten: pending.length, contentDocuments: plan.documents.length, status: 'completed' as const };
}

async function readExactNamespace(store: ShadowDocumentStore, plan: G8ProductShadowWritePlan) {
  if (store.listNamespace) {
    const actual = await store.listNamespace();
    const actualByPath = new Map<string, JsonRecord>();
    for (const document of actual) {
      assertShadowPath(document.path);
      if (document.path === G8_PRODUCT_SHADOW_ROOT) throw new Error('v2 namespace listing included the root manifest');
      if (actualByPath.has(document.path)) throw new Error(`duplicate namespace path: ${document.path}`);
      actualByPath.set(document.path, document.data);
    }
    return actualByPath;
  }
  const races = await store.list(`${G8_PRODUCT_SHADOW_NAMESPACE}/races`);
  const measures = await store.list(`${G8_PRODUCT_SHADOW_NAMESPACE}/ballotMeasures`);
  const metrics = await store.list(`${G8_PRODUCT_SHADOW_NAMESPACE}/contestMetrics`);
  const nestedRaces = await Promise.all(races.map((document) => store.list(`${document.path}/candidateResearch`)));
  const nestedMeasures = await Promise.all(measures.map((document) => store.list(`${document.path}/research`)));
  const actual = [...races, ...measures, ...metrics, ...nestedRaces.flat(), ...nestedMeasures.flat()];
  const actualByPath = new Map<string, JsonRecord>();
  for (const document of actual) {
    assertShadowPath(document.path);
    if (actualByPath.has(document.path)) throw new Error(`duplicate namespace path: ${document.path}`);
    actualByPath.set(document.path, document.data);
  }
  return actualByPath;
}

/** Verifies the complete v2 namespace, including exact paths, all family counts, and full document content. */
export async function verifyG8ProductShadowNamespace(store: ShadowDocumentStore, plan: G8ProductShadowWritePlan) {
  assertPlan(plan);
  const root = await store.get(G8_PRODUCT_SHADOW_ROOT);
  if (!root) throw new Error('v2 shadow root manifest is absent');
  assertCompatibleRoot(root, plan);
  if (root.status !== 'completed') throw new Error('v2 shadow generation is not completed');
  const actualByPath = await readExactNamespace(store, plan);
  const expectedByPath = new Map(plan.documents.map((document) => [document.path, document.data]));
  if (actualByPath.size !== expectedByPath.size) throw new Error('v2 shadow namespace document count differs from the certified plan');
  for (const [path, expected] of expectedByPath) {
    const actual = actualByPath.get(path);
    if (!actual) throw new Error(`v2 shadow namespace is missing ${path}`);
    if (!sameData(actual, expected)) throw new Error(`v2 shadow namespace content differs: ${path}`);
  }
  const actualDocuments = [...actualByPath.entries()].map(([path, data]) => ({ path, data }));
  const counts = deriveCounts(actualDocuments);
  if (!sameData(counts, plan.expectedCounts)) throw new Error('v2 shadow namespace family counts differ');
  const contentDigestValue = contentDigest(actualDocuments);
  if (contentDigestValue !== plan.namespaceDigest || root.namespaceDigest !== contentDigestValue) throw new Error('v2 shadow namespace digest differs');
  return { verified: true, contentDigest: contentDigestValue, recordedNamespaceDigest: String(root.namespaceDigest), namespaceDigest: contentDigestValue, counts };
}

export function assertCommittedG8ProductShadowSource(status: string, commit: string) {
  if (status.trim()) throw new Error('uncommitted v2 executor source');
  if (!/^[a-f0-9]{7,64}$/i.test(commit.trim())) throw new Error('missing committed v2 executor source');
  return commit.trim();
}

/** Checks only executor inputs; unrelated dirty files remain outside this gate. */
export function getCommittedG8ProductShadowSource() {
  const sourceFiles = ['package.json', 'scripts/apply-g8-2a-product-shadow.ts', 'scripts/lib/g8ProductShadowCli.ts', 'scripts/lib/g8ProductShadowExecutor.ts'];
  const status = execFileSync('git', ['status', '--porcelain', '--', ...sourceFiles], { encoding: 'utf8' });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return assertCommittedG8ProductShadowSource(status, commit);
}

function decodeTimestampTags(value: unknown, timestamp: (seconds: number, nanoseconds: number) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeTimestampTags(item, timestamp));
  if (!isRecord(value)) return value;
  if (value.__firestoreType === 'timestamp/v1') {
    const tag = value as FirestoreTimestampTag;
    if (!Number.isInteger(tag.seconds) || !Number.isInteger(tag.nanoseconds) || tag.nanoseconds % 1_000 !== 0) throw new Error('timestamp/v1 tag cannot round-trip through Firestore microsecond precision');
    return timestamp(tag.seconds, tag.nanoseconds);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeTimestampTags(item, timestamp)]));
}

/** The only Firestore boundary. It is called after CLI offline validation and production guards. */
export async function createFirestoreG8ProductShadowStore(plan: G8ProductShadowWritePlan): Promise<ShadowDocumentStore> {
  assertPlan(plan);
  const [{ bootstrapFirestore }, { Timestamp }] = await Promise.all([import('./firestoreCli.js'), import('@google-cloud/firestore')]);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== plan.target.projectId || databaseId !== plan.target.databaseId) throw new Error('unexpected Firestore target');
  const allowedPaths = new Set([G8_PRODUCT_SHADOW_ROOT, ...plan.documents.map((document) => document.path)]);
  const document = (path: string) => {
    if (!allowedPaths.has(path)) throw new Error(`unsafe v2 shadow write path: ${path}`);
    return db.doc(path);
  };
  const collection = (path: string) => {
    if (![`${G8_PRODUCT_SHADOW_NAMESPACE}/races`, `${G8_PRODUCT_SHADOW_NAMESPACE}/ballotMeasures`, `${G8_PRODUCT_SHADOW_NAMESPACE}/contestMetrics`].includes(path)
      && !new RegExp(`^${G8_PRODUCT_SHADOW_NAMESPACE}/races/[^/]+/candidateResearch$`).test(path)
      && !new RegExp(`^${G8_PRODUCT_SHADOW_NAMESPACE}/ballotMeasures/[^/]+/research$`).test(path)) throw new Error(`unsafe v2 shadow collection: ${path}`);
    return db.collection(path);
  };
  return {
    async get(path) {
      const snapshot = await document(path).get();
      return snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), path) as JsonRecord : null;
    },
    async list(path) {
      const snapshot = await collection(path).get();
      return snapshot.docs.map((item) => ({ path: item.ref.path, data: encodeFirestoreSnapshotValue(item.data(), item.ref.path) as JsonRecord }));
    },
    async listNamespace() {
      const documents: ShadowDocument[] = [];
      const visitCollection = async (collectionReference: FirestoreCollectionLike) => {
        for (const reference of await collectionReference.listDocuments()) {
          const snapshot = await reference.get();
          if (snapshot.exists) documents.push({ path: reference.path, data: encodeFirestoreSnapshotValue(snapshot.data(), reference.path) as JsonRecord });
          for (const child of await reference.listCollections()) await visitCollection(child);
        }
      };
      for (const child of await db.doc(G8_PRODUCT_SHADOW_ROOT).listCollections()) await visitCollection(child);
      return documents;
    },
    async commit(writes) {
      if (writes.length === 0 || writes.length > 400) throw new Error('v2 shadow batch must contain 1 to 400 operations');
      const batch = db.batch();
      for (const write of writes) {
        if (!allowedPaths.has(write.path)) throw new Error(`unsafe v2 shadow write path: ${write.path}`);
        if (write.operation === 'set' && write.path !== G8_PRODUCT_SHADOW_ROOT) throw new Error('only the v2 root manifest may be updated');
        const data = decodeTimestampTags(write.data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds));
        if (write.operation === 'create') batch.create(document(write.path), data);
        else batch.set(document(write.path), data);
      }
      await batch.commit();
    },
  };
}
