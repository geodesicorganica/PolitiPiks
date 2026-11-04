import { buildEaRelease, canonical, digest, type Json, type ReleaseBundle } from './ea2026Release.js';

export const SELECTOR_PATH = 'catalogActivations/canonical-2026';
export type Operation = { path: string; before: Json | null; after: Json };
export type PublicationPlan = {
  contract: 'politipiks-ea-publication/v1'; releaseDigest: string; generation: string;
  priorSelector: Json | null; pendingSelector: Json; activeSelector: Json;
  operations: Operation[]; digest: string;
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Build only from a reviewed input and exact before-images, never from counts supplied by an operator. */
export function planEaPublication(input: unknown, suppliedBundle: ReleaseBundle, before: Record<string, Json | null>, priorSelector: Json | null): PublicationPlan {
  const bundle = buildEaRelease(input);
  if (!same(bundle, suppliedBundle)) throw new Error('bundle does not reproduce from reviewed input');
  const paths = bundle.documents.map(x => x.path).sort();
  if (!same(Object.keys(before).sort(), paths)) throw new Error('before-image inventory mismatch');
  if (priorSelector?.state === 'pending') throw new Error('another publication is pending');
  const operations = bundle.documents.map(document => {
    const old = before[document.path];
    if (old !== null && (!old || typeof old !== 'object' || Array.isArray(old))) throw new Error('invalid before-image');
    if (/^ballotMeasures\/[^/]+$/.test(document.path)) {
      const identity = document.data.measureIdentity as Json | undefined;
      if (!identity) throw new Error('measure needs reviewed stable identity before publication');
      if (old !== null && old.title !== identity.legacyTitle && !(old.title === document.data.title && same(old.measureIdentity, identity))) throw new Error('measure destination identity changed; compatibility review required');
    }
    // Source-owned fields are explicit in the bundle. Other fields remain intact.
    const after = { ...(old ?? {}), ...document.data };
    // Stale outcome fields must never cross into this pre-election release.
    for (const key of ['winnerId', 'winner', 'calledWinner', 'result', 'electionResult', 'certifiedResult']) {
      if (old && key in old) throw new Error('existing outcome requires explicit disposition');
    }
    return { path: document.path, before: old, after };
  });
  const pendingSelector = { ...bundle.selector, state: 'pending', releaseDigest: bundle.digest };
  const payload = { contract: 'politipiks-ea-publication/v1' as const, releaseDigest: bundle.digest, generation: bundle.generation, priorSelector, pendingSelector, activeSelector: { ...bundle.selector, releaseDigest: bundle.digest }, operations };
  return { ...payload, digest: digest(payload) };
}

export type Transaction = { read(path: string): Promise<Json | null>; write(path: string, data: Json): void };
export type PublicationStore = {
  read(path: string): Promise<Json | null>;
  transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T>;
};
export type PublicationProgress = { planDigest: string; phase: string; verified: number; written: number };
type Persist = (receipt: PublicationProgress) => Promise<void>;
function validatePlan(plan: PublicationPlan) {
  const { digest: expected, ...payload } = plan;
  if (digest(payload) !== expected || plan.contract !== 'politipiks-ea-publication/v1' || !plan.operations.length || new Set(plan.operations.map(x => x.path)).size !== plan.operations.length) throw new Error('invalid publication plan');
}
async function classify(store: PublicationStore, plan: PublicationPlan) {
  const values = new Map<string, Json | null>();
  for (const operation of plan.operations) {
    const current = await store.read(operation.path);
    if (!same(current, operation.before) && !same(current, operation.after)) throw new Error('destination changed; stop before writes');
    values.set(operation.path, current);
  }
  return values;
}
async function changeSelector(store: PublicationStore, expected: Json | null, desired: Json) {
  await store.transaction(async tx => {
    if (!same(await tx.read(SELECTOR_PATH), expected)) throw new Error('selector changed');
    tx.write(SELECTOR_PATH, desired);
  });
}

/** Transaction implementation must disable automatic retries. Exactly one owner invokes this executor. */
export async function publishEaRelease(store: PublicationStore, plan: PublicationPlan, persist: Persist) {
  validatePlan(plan);
  const selector = await store.read(SELECTOR_PATH);
  if (![plan.priorSelector, plan.pendingSelector, plan.activeSelector].some(x => same(selector, x))) throw new Error('selector conflict');
  const values = await classify(store, plan);
  if (same(selector, plan.activeSelector)) {
    if (plan.operations.some(op => !same(values.get(op.path), op.after))) throw new Error('active release content drift');
    await persist({ planDigest: plan.digest, phase: 'already-active', verified: plan.operations.length, written: 0 });
    return;
  }
  await persist({ planDigest: plan.digest, phase: 'preclassified', verified: values.size, written: 0 });
  if (!same(selector, plan.pendingSelector)) await changeSelector(store, plan.priorSelector, plan.pendingSelector);
  let written = 0;
  for (let offset = 0; offset < plan.operations.length; offset += 100) {
    const batch = plan.operations.slice(offset, offset + 100);
    const count = await store.transaction(async tx => {
      if (!same(await tx.read(SELECTOR_PATH), plan.pendingSelector)) throw new Error('pending selector changed');
      const reads = await Promise.all(batch.map(op => tx.read(op.path)));
      for (let i = 0; i < batch.length; i++) if (!same(reads[i], batch[i].before) && !same(reads[i], batch[i].after)) throw new Error('compare-before-write conflict');
      let n = 0;
      batch.forEach((op, i) => { if (!same(reads[i], op.after)) { tx.write(op.path, op.after); n++; } });
      return n;
    });
    written += count;
    await persist({ planDigest: plan.digest, phase: 'batch-completed', verified: offset + batch.length, written });
  }
  for (const op of plan.operations) if (!same(await store.read(op.path), op.after)) throw new Error('post-write verification failed');
  await persist({ planDigest: plan.digest, phase: 'content-verified', verified: plan.operations.length, written });
  await changeSelector(store, plan.pendingSelector, plan.activeSelector);
  await persist({ planDigest: plan.digest, phase: 'active', verified: plan.operations.length, written });
}

export async function rollbackEaRelease(store: PublicationStore, plan: PublicationPlan, persist: Persist) {
  validatePlan(plan);
  const current = await store.read(SELECTOR_PATH);
  if (![plan.pendingSelector, plan.activeSelector].some(x => same(current, x))) throw new Error('rollback selector conflict');
  await classify(store, plan);
  if (!same(current, plan.pendingSelector)) await changeSelector(store, plan.activeSelector, plan.pendingSelector);
  let written = 0;
  for (let offset = 0; offset < plan.operations.length; offset += 100) {
    const batch = plan.operations.slice(offset, offset + 100);
    written += await store.transaction(async tx => {
      if (!same(await tx.read(SELECTOR_PATH), plan.pendingSelector)) throw new Error('rollback selector changed');
      const reads = await Promise.all(batch.map(op => tx.read(op.path)));
      for (let i = 0; i < batch.length; i++) if (!same(reads[i], batch[i].before) && !same(reads[i], batch[i].after)) throw new Error('rollback content changed');
      let n = 0;
      batch.forEach((op, i) => { if (op.before !== null && !same(reads[i], op.before)) { tx.write(op.path, op.before); n++; } });
      return n;
    });
    await persist({ planDigest: plan.digest, phase: 'rollback-batch', verified: offset + batch.length, written });
  }
  for (const op of plan.operations) {
    const value = await store.read(op.path);
    if (op.before === null ? value !== null && !same(value, op.after) : !same(value, op.before)) throw new Error('rollback verification failed');
  }
  // An absent old selector is represented explicitly, without deleting anything.
  const fallback = { state: 'rollback', activeFederalGeneration: 'legacy-2026', activeMeasureGeneration: 'none' };
  await changeSelector(store, plan.pendingSelector, plan.priorSelector ?? fallback);
  await persist({ planDigest: plan.digest, phase: 'rolled-back', verified: plan.operations.length, written });
}
