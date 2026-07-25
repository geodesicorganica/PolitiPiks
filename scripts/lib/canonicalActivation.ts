import { createHash } from 'node:crypto';
import {
  CANONICAL_SHADOW_GENERATION,
  CERTIFIED_CANONICAL_SHADOW,
  buildCanonicalShadowWritePlan,
  createFirestoreCanonicalShadowStore,
  verifyCanonicalShadowNamespace,
} from './canonicalShadowExecutor.js';
import { encodeFirestoreSnapshotValue, type CanonicalMigrationSnapshot, type FirestoreTimestampTag } from './canonicalMigration.js';
import { assertPublicationActivationDocuments, assertPublicationReady, type CanonicalPublicationPlan } from './canonicalPublication.js';

type JsonRecord = Record<string, unknown>;
type ActivationState = 'pending' | 'active' | 'rollback';

export type ActivationCertification = {
  projectId: string;
  databaseId: string;
  generation: string;
  sourceCommit: string;
  inputDigest: string;
  mappingDigest: string;
  planDigest: string;
  lockPolicyDigest: string;
  namespaceDigest: string;
  expectedCounts: { races: number; research: number; metrics: number };
};

export type ActivationDocument = { path: string; data: JsonRecord };
export type ActivationWrite = { operation: 'create' | 'set'; path: string; data: JsonRecord };
export type ActivationDocumentStore = {
  get(path: string): Promise<JsonRecord | null>;
  list(collectionPath: string): Promise<ActivationDocument[]>;
  commit(writes: ActivationWrite[]): Promise<void>;
};

export type CanonicalActivationPlan = {
  certification: ActivationCertification;
  manifestPath: 'catalogActivations/canonical-2026';
  pendingManifest: JsonRecord;
  activeManifest: JsonRecord;
  documents: ActivationDocument[];
};

export type CertifiedCanonicalActivationBundle = {
  plan: CanonicalActivationPlan;
  shadowPlan: ReturnType<typeof buildCanonicalShadowWritePlan>;
};

const LEGACY_FEDERAL_GENERATION = 'legacy-2026';
const MANIFEST_PATH = 'catalogActivations/canonical-2026' as const;
export const CERTIFIED_CANONICAL_ACTIVATION = {
  ...CERTIFIED_CANONICAL_SHADOW,
  generation: CANONICAL_SHADOW_GENERATION,
  shadowSourceCommit: 'fdb824d6512d33d78eb12f5766088712aa549d2c',
  namespaceDigest: '05b9f50ab06c6242e7b2e3443443f0abe67241c48592bd49a7abcfebf30de337',
  lockPolicyDigest: '0000000000000000000000000000000000000000000000000000000000000000',
} as const;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sameData = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

function assertDigest(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`invalid ${label}`);
}

function assertCertification(certification: ActivationCertification) {
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/.test(certification.generation)) throw new Error('invalid activation generation');
  if (!/^[a-f0-9]{7,64}$/i.test(certification.sourceCommit)) throw new Error('invalid source commit');
  assertDigest(certification.inputDigest, 'input digest');
  assertDigest(certification.mappingDigest, 'mapping digest');
  assertDigest(certification.planDigest, 'plan digest');
  assertDigest(certification.lockPolicyDigest, 'lock policy digest');
  assertDigest(certification.namespaceDigest, 'namespace digest');
  for (const count of Object.values(certification.expectedCounts)) if (!Number.isInteger(count) || count < 0) throw new Error('invalid expected counts');
}

function shadowRoot(generation: string) {
  return `migrationShadows/${generation}`;
}

function activationMetadata(certification: ActivationCertification) {
  return {
    schemaVersion: 1,
    kind: 'canonical-federal-registry',
    projectId: certification.projectId,
    databaseId: certification.databaseId,
    generation: certification.generation,
    sourceCommit: certification.sourceCommit,
    inputDigest: certification.inputDigest,
    mappingDigest: certification.mappingDigest,
    planDigest: certification.planDigest,
    lockPolicyDigest: certification.lockPolicyDigest,
    namespaceDigest: certification.namespaceDigest,
    expectedCounts: certification.expectedCounts,
    operatorEvidence: { kind: 'guarded-cli-certification', productionAuthorization: 'required' },
  };
}

function manifest(certification: ActivationCertification, state: ActivationState) {
  return {
    ...activationMetadata(certification),
    state,
    activeFederalGeneration: state === 'active' ? certification.generation : LEGACY_FEDERAL_GENERATION,
    previousFederalGeneration: state === 'active' ? LEGACY_FEDERAL_GENERATION : certification.generation,
  };
}

function classifyShadowPath(path: string, generation: string): { activePath: string; type: 'races' | 'research' | 'metrics' } {
  const root = shadowRoot(generation);
  let match = new RegExp(`^${root}/races/([^/]+)$`).exec(path);
  if (match) return { activePath: `races/${match[1]}`, type: 'races' };
  match = new RegExp(`^${root}/races/([^/]+)/candidateResearch/([^/]+)$`).exec(path);
  if (match) return { activePath: `races/${match[1]}/candidateResearch/${match[2]}`, type: 'research' };
  match = new RegExp(`^${root}/contestMetrics/([^/]+)$`).exec(path);
  if (match) return { activePath: `contestMetrics/${match[1]}`, type: 'metrics' };
  throw new Error(`unsafe shadow document path: ${path}`);
}

function assertPlan(plan: CanonicalActivationPlan) {
  assertCertification(plan.certification);
  if (plan.manifestPath !== MANIFEST_PATH) throw new Error('unsafe activation manifest path');
  const counts = { races: 0, research: 0, metrics: 0 };
  const paths = new Set<string>();
  for (const document of plan.documents) {
    const { activePath, type } = classifyShadowPath(`${shadowRoot(plan.certification.generation)}/${document.path.startsWith('races/') ? document.path : document.path}`, plan.certification.generation);
    if (activePath !== document.path) throw new Error(`unsafe active activation path: ${document.path}`);
    if (paths.has(document.path)) throw new Error(`duplicate activation document: ${document.path}`);
    paths.add(document.path);
    counts[type] += 1;
  }
  if (!sameData(counts, plan.certification.expectedCounts)) throw new Error('unexpected activation document counts');
  if (plan.pendingManifest.state !== 'pending' || plan.activeManifest.state !== 'active') throw new Error('invalid activation manifest state');
  assertPublicationActivationDocuments(plan.certification.generation, plan.documents);
}

/** Builds a deterministic active-document plan from verified shadow documents. It never accepts legacy active paths. */
export function buildCanonicalActivationPlan(certification: ActivationCertification, shadowDocuments: ActivationDocument[]): CanonicalActivationPlan {
  assertCertification(certification);
  const documents = shadowDocuments.map((source) => {
    const { activePath, type } = classifyShadowPath(source.path, certification.generation);
    const data: JsonRecord = {
      ...source.data,
      catalogScope: 'federal',
      registryGeneration: certification.generation,
      canonicalActivation: { generation: certification.generation, namespaceDigest: certification.namespaceDigest, sourcePath: source.path },
    };
    if (type === 'research') {
      const [, raceId,, candidateId] = activePath.split('/');
      if (data.raceId !== raceId || data.candidateId !== candidateId) throw new Error(`incompatible canonical research identity: ${source.path}`);
    }
    if (type === 'metrics' && data.raceId !== activePath.split('/').at(-1)) throw new Error(`incompatible canonical metric identity: ${source.path}`);
    return { path: activePath, data };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const plan: CanonicalActivationPlan = {
    certification,
    manifestPath: MANIFEST_PATH,
    pendingManifest: manifest(certification, 'pending'),
    activeManifest: manifest(certification, 'active'),
    documents,
  };
  assertPlan(plan);
  return plan;
}

/** Production-v2 boundary: only a fully audited 470-seat publication plan may become an activation plan. */
export function buildPublicationV2ActivationPlan(certification: ActivationCertification, publication: CanonicalPublicationPlan): CanonicalActivationPlan {
  if (certification.generation !== publication.generation || certification.inputDigest !== publication.inputDigest
    || certification.mappingDigest !== publication.mappingDigest || certification.planDigest !== publication.planDigest || certification.lockPolicyDigest !== publication.lockPolicyDigest
    || certification.expectedCounts.races !== publication.expectedCounts.races || certification.expectedCounts.research !== publication.expectedCounts.research
    || certification.expectedCounts.metrics !== publication.expectedCounts.metrics) throw new Error('publication certification does not match the v2 plan');
  assertPublicationReady(publication);
  return buildCanonicalActivationPlan(certification, publication.documents.map((document) => ({
    path: `migrationShadows/${publication.generation}/${document.path}`, data: document.data,
  })));
}

/** Rebuilds the certified canonical plan locally; this is credential-free and never initializes Firestore. */
export function buildCertifiedCanonicalActivationBundle(snapshot: CanonicalMigrationSnapshot): CertifiedCanonicalActivationBundle {
  const shadowPlan = buildCanonicalShadowWritePlan(snapshot, CERTIFIED_CANONICAL_ACTIVATION.shadowSourceCommit);
  const plan = buildCanonicalActivationPlan({
    projectId: CERTIFIED_CANONICAL_ACTIVATION.projectId,
    databaseId: CERTIFIED_CANONICAL_ACTIVATION.databaseId,
    generation: CERTIFIED_CANONICAL_ACTIVATION.generation,
    sourceCommit: CERTIFIED_CANONICAL_ACTIVATION.shadowSourceCommit,
    inputDigest: CERTIFIED_CANONICAL_ACTIVATION.inputDigest,
    mappingDigest: CERTIFIED_CANONICAL_ACTIVATION.mappingDigest,
    planDigest: CERTIFIED_CANONICAL_ACTIVATION.planDigest,
    lockPolicyDigest: CERTIFIED_CANONICAL_ACTIVATION.lockPolicyDigest,
    namespaceDigest: CERTIFIED_CANONICAL_ACTIVATION.namespaceDigest,
    expectedCounts: shadowPlan.expectedCounts,
  }, shadowPlan.documents);
  return { plan, shadowPlan };
}

function assertCompatibleManifest(existing: JsonRecord, plan: CanonicalActivationPlan) {
  for (const [key, value] of Object.entries(activationMetadata(plan.certification))) {
    if (!sameData(existing[key], value)) throw new Error(`conflicting activation manifest: ${key}`);
  }
  if (existing.state !== 'pending' && existing.state !== 'active' && existing.state !== 'rollback') throw new Error('invalid activation manifest state');
}

function assertExistingDocument(path: string, existing: JsonRecord | null, expected: JsonRecord) {
  if (existing !== null && !sameData(existing, expected)) throw new Error(`conflicting active canonical content: ${path}`);
}

async function assertPromotedDocuments(store: ActivationDocumentStore, plan: CanonicalActivationPlan) {
  const actual = await Promise.all(plan.documents.map(async (document) => ({ document, actual: await store.get(document.path) })));
  for (const item of actual) {
    if (!item.actual) throw new Error(`active canonical document missing: ${item.document.path}`);
    if (!sameData(item.actual, item.document.data)) throw new Error(`active canonical content differs: ${item.document.path}`);
  }
}

/** Stages a pending manifest, creates only canonical active documents, then atomically flips the selector to active. */
export async function executeCanonicalActivationPlan(
  store: ActivationDocumentStore,
  plan: CanonicalActivationPlan,
  now: () => string = () => new Date().toISOString(),
) {
  assertPlan(plan);
  const existingManifest = await store.get(plan.manifestPath);
  if (existingManifest) assertCompatibleManifest(existingManifest, plan);
  const existing = await Promise.all(plan.documents.map(async (document) => ({ document, existing: await store.get(document.path) })));
  for (const item of existing) assertExistingDocument(item.document.path, item.existing, item.document.data);
  const pending = existing.filter((item) => item.existing === null).map((item) => item.document);
  if (existingManifest?.state === 'active') {
    if (pending.length > 0) throw new Error('active generation is missing canonical documents');
    return { applied: false, resumed: false, documentsWritten: 0, batches: 0, status: 'active' as const };
  }
  if (existingManifest?.state === 'rollback') throw new Error('rollback manifest requires a forward-fix, not activation resume');
  let batches = 0;
  if (!existingManifest) {
    await store.commit([{ operation: 'create', path: plan.manifestPath, data: { ...plan.pendingManifest, pendingAt: now() } }]);
    batches += 1;
  }
  for (let start = 0; start < pending.length; start += 399) {
    const writes = pending.slice(start, start + 399).map((document) => ({ operation: 'create' as const, path: document.path, data: document.data }));
    if (writes.length > 399) throw new Error('activation batch exceeds 399 promoted documents');
    if (writes.length > 0) { await store.commit(writes); batches += 1; }
  }
  await assertPromotedDocuments(store, plan);
  await store.commit([{ operation: 'set', path: plan.manifestPath, data: { ...plan.activeManifest, activatedAt: now() } }]);
  batches += 1;
  return { applied: true, resumed: existingManifest !== null, documentsWritten: pending.length, batches, status: 'active' as const };
}

/** Reads the active selector and the canonical document set; it performs no writes. */
export async function verifyCanonicalActivation(store: ActivationDocumentStore, plan: CanonicalActivationPlan) {
  assertPlan(plan);
  const activeManifest = await store.get(plan.manifestPath);
  if (!activeManifest) throw new Error('activation manifest is absent');
  if (!sameData(activeManifest.state, 'active') || !sameData(activeManifest.activeFederalGeneration, plan.certification.generation)) throw new Error('canonical generation is not active');
  assertCompatibleManifest(activeManifest, plan);
  await assertPromotedDocuments(store, plan);
  return { verified: true, activationDigest: digest({ manifest: activeManifest, documents: plan.documents }), counts: plan.certification.expectedCounts };
}

/** Rollback changes only the authoritative selector and leaves both generations intact. */
export async function rollbackCanonicalActivation(store: ActivationDocumentStore, plan: CanonicalActivationPlan, now: () => string = () => new Date().toISOString()) {
  assertPlan(plan);
  const activeManifest = await store.get(plan.manifestPath);
  if (!activeManifest) throw new Error('activation manifest is absent');
  assertCompatibleManifest(activeManifest, plan);
  if (activeManifest.state !== 'active' || activeManifest.activeFederalGeneration !== plan.certification.generation) throw new Error('canonical generation is not active');
  await store.commit([{
    operation: 'set', path: plan.manifestPath,
    data: { ...manifest(plan.certification, 'rollback'), rolledBackAt: now(), rollbackReason: 'operator-approved selector rollback' },
  }]);
  return { rolledBack: true, writes: 1, activeFederalGeneration: LEGACY_FEDERAL_GENERATION };
}

function isAllowedActivePath(plan: CanonicalActivationPlan, path: string) {
  return path === plan.manifestPath || plan.documents.some((document) => document.path === path);
}

function decodeTimestampTags(value: unknown, timestamp: (seconds: number, nanoseconds: number) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeTimestampTags(item, timestamp));
  if (!isRecord(value)) return value;
  if (value.__firestoreType === 'timestamp/v1') {
    const tag = value as FirestoreTimestampTag;
    if (!Number.isInteger(tag.seconds) || !Number.isInteger(tag.nanoseconds) || tag.nanoseconds % 1_000 !== 0) {
      throw new Error('timestamp/v1 tag cannot round-trip through Firestore microsecond precision');
    }
    return timestamp(tag.seconds, tag.nanoseconds);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeTimestampTags(item, timestamp)]));
}

/** The only active-path adapter. It accepts the selector and exact promoted canonical paths, never a legacy or client path. */
export async function createFirestoreCanonicalActivationStore(plan: CanonicalActivationPlan): Promise<ActivationDocumentStore> {
  assertPlan(plan);
  const [{ bootstrapFirestore }, { Timestamp }] = await Promise.all([
    import('./firestoreCli.js'),
    import('@google-cloud/firestore'),
  ]);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== plan.certification.projectId || databaseId !== plan.certification.databaseId) throw new Error('unexpected Firestore target');
  const document = (path: string) => {
    if (!isAllowedActivePath(plan, path)) throw new Error(`unsafe active activation path: ${path}`);
    return db.doc(path);
  };
  return {
    async get(path) {
      const snapshot = await document(path).get();
      return snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), path) as JsonRecord : null;
    },
    async list(collectionPath) {
      if (collectionPath !== 'races' && collectionPath !== 'contestMetrics' && !/^races\/[^/]+\/candidateResearch$/.test(collectionPath)) {
        throw new Error(`unsafe active activation collection: ${collectionPath}`);
      }
      const snapshot = await db.collection(collectionPath).get();
      return snapshot.docs.map((item) => ({ path: item.ref.path, data: encodeFirestoreSnapshotValue(item.data(), item.ref.path) as JsonRecord }));
    },
    async commit(writes) {
      if (writes.length === 0 || writes.length > 400) throw new Error('activation batch must contain 1 to 400 writes');
      const batch = db.batch();
      for (const write of writes) {
        if (!isAllowedActivePath(plan, write.path)) throw new Error(`unsafe active activation path: ${write.path}`);
        if (write.operation === 'set' && write.path !== plan.manifestPath) throw new Error('only activation manifest may be updated');
        const data = decodeTimestampTags(write.data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds));
        if (write.operation === 'create') batch.create(document(write.path), data);
        else batch.set(document(write.path), data);
      }
      await batch.commit();
    },
  };
}

/** Bounded preflight for a future apply/verify. It reads and hashes only the certified shadow namespace. */
export async function verifyCertifiedShadowForActivation(bundle: CertifiedCanonicalActivationBundle) {
  const shadowStore = await createFirestoreCanonicalShadowStore();
  const verified = await verifyCanonicalShadowNamespace(shadowStore, bundle.shadowPlan);
  if (verified.namespaceDigest !== CERTIFIED_CANONICAL_ACTIVATION.namespaceDigest) throw new Error('certified shadow namespace digest differs');
  return verified;
}
