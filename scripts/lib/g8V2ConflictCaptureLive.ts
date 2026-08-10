import { encodeFirestoreSnapshotValue } from './canonicalMigration.js';
import { captureG8V2Conflicts, type G8V2ConflictReadStore } from './g8V2ConflictCapture.js';
import type { G8V2ConflictCaptureIdentity } from './g8V2ConflictAnalysis.js';
import type { G8V2ActivationPlan } from './g8V2Activation.js';

/** This module is dynamically imported by the CLI only after its complete
 * local identity, target, bundle, manifest, and no-clobber path guards pass. */
export async function captureG8V2ConflictsLive(options: {
  plan: G8V2ActivationPlan;
  capture: Omit<G8V2ConflictCaptureIdentity, 'capturedAt'>;
}) {
  const [{ loadG8V2StateAuditDotenv, validateG8V2StateAuditEnvironment }, { bootstrapFirestore }] = await Promise.all([
    import('./g8V2StateAuditEnvironment.js'),
    import('./firestoreCli.js'),
  ]);
  loadG8V2StateAuditDotenv();
  validateG8V2StateAuditEnvironment(options.plan.target, process.env);
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== options.plan.target.projectId || databaseId !== options.plan.target.databaseId) throw new Error('unexpected Firestore target for G8.4BR5 conflict capture');
  const allowed = new Set([options.plan.manifestPath, ...options.plan.documents.map((document) => document.path)]);
  const store: G8V2ConflictReadStore = {
    async get(path) {
      if (!allowed.has(path)) throw new Error(`unsafe G8.4BR5 conflict read path: ${path}`);
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? encodeFirestoreSnapshotValue(snapshot.data(), path) as Record<string, unknown> : null;
    },
  };
  return captureG8V2Conflicts({ store, plan: options.plan, capture: options.capture });
}
