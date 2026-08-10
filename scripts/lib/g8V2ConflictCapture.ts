import { buildG8V2ConflictSnapshot, validateG8V2ConflictSnapshot, type G8V2ConflictCaptureIdentity, type G8V2ConflictObservation, type G8V2ConflictSnapshot } from './g8V2ConflictAnalysis.js';
import type { G8V2ActivationPlan } from './g8V2Activation.js';

type Json = Record<string, unknown>;

export type G8V2ConflictReadStore = {
  get(path: string): Promise<Json | null>;
};

const stableReadCode = (error: unknown) => {
  const candidate = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (candidate === 'PERMISSION_DENIED' || candidate === 'permission-denied') return 'PERMISSION_DENIED';
  if (candidate === 'RESOURCE_EXHAUSTED' || candidate === 'resource-exhausted') return 'QUOTA_EXCEEDED';
  if (['DEADLINE_EXCEEDED','UNAVAILABLE','ABORTED'].includes(candidate)) return 'COMPLETION_UNKNOWN';
  return 'READ_FAILED';
};

/** Reads only the selector and the exact manifest-derived active paths. The
 * store deliberately has no list/query/write surface. Every path is attempted
 * once, failures become bounded unknown observations, and no retry occurs. */
export async function captureG8V2Conflicts(options: {
  store: G8V2ConflictReadStore;
  plan: G8V2ActivationPlan;
  capture: Omit<G8V2ConflictCaptureIdentity, 'capturedAt'> & { capturedAt?: string };
  beforeRead?: (kind: 'selector' | 'exact-path', path: string) => void | Promise<void>;
}): Promise<G8V2ConflictSnapshot> {
  if (options.plan.documents.length !== 3352 || options.plan.expectedCounts.contentDocuments !== 3352) throw new Error('conflict capture requires the exact certified 3,352-path inventory');
  let selector: { actual: Json | null; errorCode?: string };
  try {
    await options.beforeRead?.('selector', options.plan.manifestPath);
    selector = { actual: await options.store.get(options.plan.manifestPath) };
  } catch (error) {
    selector = { actual: null, errorCode: stableReadCode(error) };
  }
  const observations: G8V2ConflictObservation[] = [];
  for (let start = 0; start < options.plan.documents.length; start += 100) {
    const batch = options.plan.documents.slice(start, start + 100);
    const results = await Promise.allSettled(batch.map(async (document) => {
      await options.beforeRead?.('exact-path', document.path);
      return { path: document.path, actual: await options.store.get(document.path) };
    }));
    results.forEach((result, index) => {
      const path = batch[index].path;
      if (result.status === 'fulfilled') observations.push(result.value);
      else observations.push({ path, actual: null, errorCode: stableReadCode(result.reason) });
    });
  }
  const snapshot = buildG8V2ConflictSnapshot({
    plan: options.plan,
    capture: { ...options.capture, capturedAt: options.capture.capturedAt ?? new Date().toISOString() },
    selector,
    observations,
  });
  return validateG8V2ConflictSnapshot(snapshot, options.plan);
}
