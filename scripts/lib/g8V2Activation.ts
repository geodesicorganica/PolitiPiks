import { createHash } from 'node:crypto';
import { encodeFirestoreSnapshotValue, type FirestoreTimestampTag } from './canonicalMigration.js';
import { CERTIFIED_G8_PRODUCT_SHADOW, type G8ProductShadowCounts, type G8ProductShadowWritePlan, type ShadowDocument } from './g8ProductShadowExecutor.js';

type Json = Record<string, unknown>;
export type G8V2ActivationState = 'pending' | 'active' | 'rollback';
export type G8V2ActivationIdentity = {
  identitySchemaVersion: 2;
  shadowSourceCommit: string;
  activationImplementationCommit: string;
};
export type G8V2AuthorizationReceipts = {
  shadowVerification: string;
  promotion: string;
  activation: string;
  rollback: string;
};
export type G8V2ActivationDocument = { path: string; data: Json };
export type G8V2ActivationWrite = { operation: 'create' | 'set'; path: string; data: Json };
export type G8V2ActivationStore = {
  get(path: string): Promise<Json | null>;
  commit(writes: G8V2ActivationWrite[]): Promise<void>;
};
export type G8V2ActivationPlan = {
  schemaVersion: 1;
  contract: 'g8-3a-v2-activation/v1';
  identitySchemaVersion: 2;
  target: { projectId: string; databaseId: string };
  generation: typeof CERTIFIED_G8_PRODUCT_SHADOW.generation;
  immutableLegacyGeneration: 'canonical-2026-shadow-v1';
  shadowSourceCommit: string;
  activationImplementationCommit: string;
  shadowNamespace: string;
  certifiedDigests: { input: string; evidence: string; plan: string; bundle: string; namespace: string };
  expectedCounts: G8ProductShadowCounts;
  authorizationReceipts: G8V2AuthorizationReceipts;
  manifestPath: 'catalogActivations/canonical-2026';
  documents: G8V2ActivationDocument[];
  pendingSelector: Json;
  activeSelector: Json;
  rollbackSelector: Json;
  planDigest: string;
};

export const G8_V2_ACTIVATION_CONTRACT = 'g8-3a-v2-activation/v1' as const;
export const G8_V2_ACTIVATION_MANIFEST_PATH = 'catalogActivations/canonical-2026' as const;
export const G8_V2_LEGACY_GENERATION = 'legacy-2026' as const;
export const CERTIFIED_G8_V2_ACTIVATION = {
  ...CERTIFIED_G8_PRODUCT_SHADOW,
  identitySchemaVersion: 2 as const,
  shadowSourceCommit: '295466ccc52ccd4d6ad4f1dfb444d48410b92910',
  immutableLegacyGeneration: 'canonical-2026-shadow-v1' as const,
  contract: G8_V2_ACTIVATION_CONTRACT,
};
export const CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT = CERTIFIED_G8_V2_ACTIVATION.shadowSourceCommit;

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('unsupported activation value');
  return encoded;
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export const sameG8V2ActivationData = (left: unknown, right: unknown) => canonicalJson(encodeFirestoreSnapshotValue(left)) === canonicalJson(encodeFirestoreSnapshotValue(right));
const sameData = sameG8V2ActivationData;
const validDigest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validReceipt = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value);

function assertPlanSource(plan: G8ProductShadowWritePlan) {
  if (plan.generation !== CERTIFIED_G8_PRODUCT_SHADOW.generation || plan.target.projectId !== CERTIFIED_G8_PRODUCT_SHADOW.projectId || plan.target.databaseId !== CERTIFIED_G8_PRODUCT_SHADOW.databaseId) throw new Error('non-certified v2 activation shadow plan');
  if (!sameData(plan.certifiedDigests, { input: CERTIFIED_G8_PRODUCT_SHADOW.inputDigest, evidence: CERTIFIED_G8_PRODUCT_SHADOW.evidenceDigest, plan: CERTIFIED_G8_PRODUCT_SHADOW.planDigest, bundle: CERTIFIED_G8_PRODUCT_SHADOW.bundleDigest })) throw new Error('non-certified v2 activation shadow digests');
  if (!sameData(plan.expectedCounts, CERTIFIED_G8_PRODUCT_SHADOW.expectedCounts) || plan.documents.length !== 3352 || !validDigest(plan.namespaceDigest)) throw new Error('non-certified v2 activation shadow counts');
  if (plan.documents.some((document) => document.path.includes('/catalogActivations/'))) throw new Error('selector cannot be promoted from the v2 shadow');
}

function classifySourcePath(path: string, namespace: string): 'race' | 'research' | 'measure' | 'measureResearch' | 'metric' {
  const relative = path.startsWith(`${namespace}/`) ? path.slice(namespace.length + 1) : '';
  if (/^races\/[^/]+$/.test(relative)) return 'race';
  if (/^races\/[^/]+\/candidateResearch\/[^/]+$/.test(relative)) return 'research';
  if (/^ballotMeasures\/[^/]+$/.test(relative)) return 'measure';
  if (/^ballotMeasures\/[^/]+\/research\/baseline$/.test(relative)) return 'measureResearch';
  if (/^contestMetrics\/[^/]+$/.test(relative)) return 'metric';
  throw new Error(`unsafe v2 activation shadow document path: ${path}`);
}

function activePath(path: string, namespace: string) {
  if (!path.startsWith(`${namespace}/`)) throw new Error(`shadow document is outside the certified namespace: ${path}`);
  return path.slice(namespace.length + 1);
}

function addActivationMetadata(data: Json, kind: ReturnType<typeof classifySourcePath>, sourcePath: string, identity: G8V2ActivationIdentity) {
  const federal = kind === 'race' || kind === 'research' || kind === 'metric';
  const catalogScope = federal ? 'federal' : 'canonical-2026-measures';
  const expected = { catalogScope, registryGeneration: CERTIFIED_G8_PRODUCT_SHADOW.generation };
  for (const [key, value] of Object.entries(expected)) if (data[key] !== undefined && !sameData(data[key], value)) throw new Error(`conflicting v2 catalog metadata at ${sourcePath}: ${key}`);
  return { ...data, ...expected, canonicalActivation: {
    contract: G8_V2_ACTIVATION_CONTRACT,
    identitySchemaVersion: identity.identitySchemaVersion,
    generation: CERTIFIED_G8_PRODUCT_SHADOW.generation,
    shadowSourceCommit: identity.shadowSourceCommit,
    activationImplementationCommit: identity.activationImplementationCommit,
    sourcePath,
  } };
}

function selector(plan: Pick<G8V2ActivationPlan, 'target' | 'shadowSourceCommit' | 'activationImplementationCommit' | 'certifiedDigests' | 'expectedCounts' | 'authorizationReceipts'>, state: G8V2ActivationState) {
  const active = state === 'active';
  return {
    schemaVersion: 1,
    identitySchemaVersion: 2,
    contract: G8_V2_ACTIVATION_CONTRACT,
    kind: 'canonical-2026-v2-catalog-activation',
    state,
    projectId: plan.target.projectId,
    databaseId: plan.target.databaseId,
    generation: CERTIFIED_G8_PRODUCT_SHADOW.generation,
    activeFederalGeneration: active ? CERTIFIED_G8_PRODUCT_SHADOW.generation : G8_V2_LEGACY_GENERATION,
    activeMeasureGeneration: active ? CERTIFIED_G8_PRODUCT_SHADOW.generation : 'none',
    immutableLegacyGeneration: 'canonical-2026-shadow-v1',
    shadowSourceCommit: plan.shadowSourceCommit,
    activationImplementationCommit: plan.activationImplementationCommit,
    certifiedDigests: plan.certifiedDigests,
    expectedCounts: plan.expectedCounts,
    authorizationReceipts: plan.authorizationReceipts,
  };
}

function deriveCounts(documents: G8V2ActivationDocument[]) {
  return {
    races: documents.filter((document) => /^races\/[^/]+$/.test(document.path)).length,
    measures: documents.filter((document) => /^ballotMeasures\/[^/]+$/.test(document.path)).length,
    candidateResearch: documents.filter((document) => /^races\/[^/]+\/candidateResearch\/[^/]+$/.test(document.path)).length,
    measureResearch: documents.filter((document) => /^ballotMeasures\/[^/]+\/research\/baseline$/.test(document.path)).length,
    metrics: documents.filter((document) => /^contestMetrics\/[^/]+$/.test(document.path)).length,
    contentDocuments: documents.length,
    totalBundleDocuments: 3353,
    selectorsExcluded: 1,
  };
}

function assertActivationPlan(plan: G8V2ActivationPlan) {
  if (plan.schemaVersion !== 1 || plan.identitySchemaVersion !== 2 || plan.contract !== G8_V2_ACTIVATION_CONTRACT || plan.manifestPath !== G8_V2_ACTIVATION_MANIFEST_PATH) throw new Error('malformed g8.3a activation plan');
  if (plan.generation !== CERTIFIED_G8_PRODUCT_SHADOW.generation || plan.immutableLegacyGeneration !== 'canonical-2026-shadow-v1' || plan.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT || !/^[a-f0-9]{7,64}$/i.test(plan.activationImplementationCommit)) throw new Error('invalid g8.3a activation identity');
  if (!sameData(plan.target, { projectId: CERTIFIED_G8_PRODUCT_SHADOW.projectId, databaseId: CERTIFIED_G8_PRODUCT_SHADOW.databaseId })) throw new Error('invalid g8.3a activation target');
  if (!sameData(plan.expectedCounts, CERTIFIED_G8_PRODUCT_SHADOW.expectedCounts) || !sameData(deriveCounts(plan.documents), plan.expectedCounts)) throw new Error('invalid g8.3a activation counts');
  for (const receipt of Object.values(plan.authorizationReceipts)) if (!validReceipt(receipt)) throw new Error('missing operation-specific g8.3a authorization receipt');
  const paths = new Set<string>();
  for (const document of plan.documents) {
    if (paths.has(document.path) || !/^(?:races\/[^/]+|races\/[^/]+\/candidateResearch\/[^/]+|ballotMeasures\/[^/]+|ballotMeasures\/[^/]+\/research\/baseline|contestMetrics\/[^/]+)$/.test(document.path)) throw new Error(`unsafe or duplicate v2 active path: ${document.path}`);
    paths.add(document.path);
  }
  if (digest(plan.documents.map((document) => [document.path, document.data])) !== plan.planDigest) throw new Error('g8.3a activation plan digest differs');
}

/** Deterministically maps the already-certified v2 shadow plan to active paths. No Firestore access occurs here. */
export function buildG8V2ActivationPlan(shadowPlan: G8ProductShadowWritePlan, authorizationReceipts: G8V2AuthorizationReceipts, identity: G8V2ActivationIdentity): G8V2ActivationPlan {
  assertPlanSource(shadowPlan);
  if (identity.identitySchemaVersion !== 2 || identity.shadowSourceCommit !== CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT || shadowPlan.sourceCommit !== identity.shadowSourceCommit || !/^[a-f0-9]{7,64}$/i.test(identity.activationImplementationCommit)) throw new Error('mismatched g8.3a shadow and activation implementation identity');
  if (!Object.values(authorizationReceipts).every(validReceipt)) throw new Error('missing operation-specific g8.3a authorization receipt');
  const namespace = `migrationShadows/${shadowPlan.generation}`;
  const documents = shadowPlan.documents.map((source: ShadowDocument) => {
    const kind = classifySourcePath(source.path, namespace);
    return { path: activePath(source.path, namespace), data: addActivationMetadata(structuredClone(source.data), kind, source.path, identity) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const base = {
    target: shadowPlan.target,
    shadowSourceCommit: identity.shadowSourceCommit,
    activationImplementationCommit: identity.activationImplementationCommit,
    certifiedDigests: { ...shadowPlan.certifiedDigests, namespace: shadowPlan.namespaceDigest },
    expectedCounts: { ...shadowPlan.expectedCounts },
    authorizationReceipts,
  };
  const plan: G8V2ActivationPlan = {
    schemaVersion: 1,
    identitySchemaVersion: 2,
    contract: G8_V2_ACTIVATION_CONTRACT,
    target: base.target,
    generation: CERTIFIED_G8_PRODUCT_SHADOW.generation,
    immutableLegacyGeneration: 'canonical-2026-shadow-v1',
    shadowSourceCommit: base.shadowSourceCommit,
    activationImplementationCommit: base.activationImplementationCommit,
    shadowNamespace: namespace,
    certifiedDigests: base.certifiedDigests,
    expectedCounts: base.expectedCounts,
    authorizationReceipts,
    manifestPath: G8_V2_ACTIVATION_MANIFEST_PATH,
    documents,
    pendingSelector: selector(base, 'pending'),
    activeSelector: selector(base, 'active'),
    rollbackSelector: selector(base, 'rollback'),
    planDigest: digest(documents.map((document) => [document.path, document.data])),
  };
  assertActivationPlan(plan);
  return plan;
}

function assertCompatibleSelector(existing: Json, plan: G8V2ActivationPlan) {
  if (existing.contract !== G8_V2_ACTIVATION_CONTRACT) throw new Error('existing catalog selector belongs to a legacy or incompatible activation contract');
  for (const [key, value] of Object.entries(plan.activeSelector)) {
    if (['state', 'activeFederalGeneration', 'activeMeasureGeneration', 'authorizationReceipts'].includes(key)) continue;
    if (!sameData(existing[key], value)) throw new Error(`conflicting g8.3a selector: ${key}`);
  }
  if (!['pending', 'active', 'rollback'].includes(String(existing.state))) throw new Error('invalid g8.3a selector state');
}

async function assertExactContent(store: G8V2ActivationStore, plan: G8V2ActivationPlan) {
  const actual = await Promise.all(plan.documents.map(async (document) => ({ document, value: await store.get(document.path) })));
  for (const item of actual) {
    if (!item.value) throw new Error(`promoted v2 content is missing: ${item.document.path}`);
    if (!sameData(item.value, item.document.data)) throw new Error(`promoted v2 content differs: ${item.document.path}`);
  }
}

/** Validates all existing state before the first write, then performs bounded create-only promotion and final activation. */
export async function executeG8V2Activation(store: G8V2ActivationStore, plan: G8V2ActivationPlan, now: () => string = () => new Date().toISOString()) {
  assertActivationPlan(plan);
  const existingSelector = await store.get(plan.manifestPath);
  if (existingSelector) assertCompatibleSelector(existingSelector, plan);
  const existingContent = await Promise.all(plan.documents.map(async (document) => ({ document, actual: await store.get(document.path) })));
  for (const item of existingContent) if (item.actual && !sameData(item.actual, item.document.data)) throw new Error(`conflicting active v2 content: ${item.document.path}`);
  if (existingSelector?.state === 'active') {
    if (existingSelector.activeFederalGeneration !== plan.generation || existingSelector.activeMeasureGeneration !== plan.generation) throw new Error('active selector has incompatible v2 generation');
    await assertExactContent(store, plan);
    return { applied: false, resumed: false, documentsWritten: 0, batches: 0, status: 'active' as const };
  }
  if (existingSelector?.state === 'rollback') throw new Error('rollback state requires a fresh approved forward activation plan');
  let batches = 0;
  if (!existingSelector) { await store.commit([{ operation: 'create', path: plan.manifestPath, data: { ...plan.pendingSelector, pendingAt: now() } }]); batches += 1; }
  const pending = existingContent.filter((item) => !item.actual).map((item) => item.document);
  for (let start = 0; start < pending.length; start += 399) {
    const writes = pending.slice(start, start + 399).map((document) => ({ operation: 'create' as const, path: document.path, data: document.data }));
    if (writes.length) { await store.commit(writes); batches += 1; }
  }
  await assertExactContent(store, plan);
  await store.commit([{ operation: 'set', path: plan.manifestPath, data: { ...plan.activeSelector, activatedAt: now() } }]);
  return { applied: true, resumed: Boolean(existingSelector), documentsWritten: pending.length, batches: batches + 1, status: 'active' as const };
}

export async function verifyG8V2Activation(store: G8V2ActivationStore, plan: G8V2ActivationPlan) {
  assertActivationPlan(plan);
  const selectorDocument = await store.get(plan.manifestPath);
  if (!selectorDocument) throw new Error('g8.3a selector is absent');
  assertCompatibleSelector(selectorDocument, plan);
  if (selectorDocument.state !== 'active' || selectorDocument.activeFederalGeneration !== plan.generation || selectorDocument.activeMeasureGeneration !== plan.generation) throw new Error('g8.3a v2 generation is not active');
  await assertExactContent(store, plan);
  return { verified: true, promotedContentDocuments: plan.documents.length, activationDigest: digest({ selector: selectorDocument, documents: plan.documents }), counts: plan.expectedCounts };
}

/** Selector-only rollback. v1, v2, and legacy content are retained. */
export async function rollbackG8V2Activation(store: G8V2ActivationStore, plan: G8V2ActivationPlan, now: () => string = () => new Date().toISOString()) {
  assertActivationPlan(plan);
  const selectorDocument = await store.get(plan.manifestPath);
  if (!selectorDocument) throw new Error('g8.3a selector is absent');
  assertCompatibleSelector(selectorDocument, plan);
  if (selectorDocument.state !== 'active' || selectorDocument.activeFederalGeneration !== plan.generation) throw new Error('g8.3a v2 generation is not active');
  await store.commit([{ operation: 'set', path: plan.manifestPath, data: { ...plan.rollbackSelector, rolledBackAt: now(), rollbackReason: 'operator-approved selector-only rollback' } }]);
  return { rolledBack: true, writes: 1, activeFederalGeneration: G8_V2_LEGACY_GENERATION, activeMeasureGeneration: 'none' as const };
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

export async function createFirestoreG8V2ActivationStore(plan: G8V2ActivationPlan): Promise<G8V2ActivationStore> {
  assertActivationPlan(plan);
  const [{ bootstrapFirestore }, { Timestamp }] = await Promise.all([import('./firestoreCli.js'), import('@google-cloud/firestore')]);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== plan.target.projectId || databaseId !== plan.target.databaseId) throw new Error('unexpected Firestore target for g8.3a activation');
  const allowed = new Set([plan.manifestPath, ...plan.documents.map((document) => document.path)]);
  const document = (path: string) => { if (!allowed.has(path)) throw new Error(`unsafe g8.3a active path: ${path}`); return db.doc(path); };
  return {
    async get(path) { const snapshot = await document(path).get(); return snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), path) as Json : null; },
    async commit(writes) {
      if (writes.length === 0 || writes.length > 400) throw new Error('g8.3a activation batch must contain 1 to 400 operations');
      const batch = db.batch();
      for (const write of writes) {
        if (write.operation === 'set' && write.path !== plan.manifestPath) throw new Error('g8.3a content is create-only');
        const data = decodeTimestampTags(write.data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds));
        if (write.operation === 'create') batch.create(document(write.path), data); else batch.set(document(write.path), data);
      }
      await batch.commit();
    },
  };
}

export type G8V2ActivationAuditStore = {
  get(path: string): Promise<Json | null>;
};

/** Read-only Firestore store for the bounded state auditor. The allowed path set
 * prevents accidental collection scans or reads outside the certified plan. */
export async function createFirestoreG8V2ActivationAuditStore(plan: G8V2ActivationPlan): Promise<G8V2ActivationAuditStore> {
  assertActivationPlan(plan);
  const [{ bootstrapFirestore }] = await Promise.all([import('./firestoreCli.js')]);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== plan.target.projectId || databaseId !== plan.target.databaseId) throw new Error('unexpected Firestore target for g8.4br0 state audit');
  const allowed = new Set([plan.manifestPath, ...plan.documents.map((document) => document.path)]);
  return {
    async get(path) {
      if (!allowed.has(path)) throw new Error(`unsafe g8.4br0 audit path: ${path}`);
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), path) as Json : null;
    },
  };
}
