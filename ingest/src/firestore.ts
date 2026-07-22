import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import dotenv from 'dotenv';
import { reconcileCandidates, type CandidateRecord } from './reconcile.js';

for (const candidate of [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '..', '.env.local')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false, quiet: true });
    break;
  }
}

export function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getFirestore() {
  const projectId = requireEnv('PROJECT_ID');
  const databaseId = requireEnv('FIRESTORE_DATABASE_ID');
  return new Firestore({ projectId, databaseId });
}

// -----------------------------------------------------------------------------
// CLI bootstrap for one-shot seed scripts (seed-medsl2024.ts, seed-fec2026.ts,
// seed-file.ts). Distinct from getFirestore() above, which is env-var-only for
// the always-running Cloud Run service.
// -----------------------------------------------------------------------------

export type ServiceAccount = Record<string, unknown>;

export function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

export function hasFlag(name: string) {
  return process.argv.includes(name);
}

export function getServiceAccount(): ServiceAccount | null {
  const serviceAccountPath = getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? null;
  if (!serviceAccountPath) return null;
  return JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
}

function readJsonSafe(path: string) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;

  const localFirebase = readJsonSafe('firebase.json');
  const parentFirebase = readJsonSafe('../firebase.json');
  const guessed =
    ((localFirebase?.firestore as Array<{ database?: unknown }> | undefined)?.[0]?.database as string | undefined) ??
    ((parentFirebase?.firestore as Array<{ database?: unknown }> | undefined)?.[0]?.database as string | undefined);

  return guessed && guessed.length > 0 ? guessed : '(default)';
}

export function getProjectId(serviceAccount: ServiceAccount | null) {
  const cliProject = getArg('--project-id') ?? getArg('--project');
  if (cliProject) return cliProject;
  if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
  if (typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0) {
    return serviceAccount.project_id;
  }
  throw new Error('Missing project id. Provide --project-id or set PROJECT_ID.');
}

export function createFirestoreFromCli(projectId: string, databaseId: string, serviceAccount: ServiceAccount | null) {
  const db = serviceAccount
    ? (() => {
        const clientEmail = serviceAccount.client_email;
        const privateKey = serviceAccount.private_key;
        if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
          throw new Error('Invalid service account JSON: expected client_email and private_key.');
        }
        return new Firestore({ projectId, databaseId, credentials: { client_email: clientEmail, private_key: privateKey } });
      })()
    : new Firestore({ projectId, databaseId });

  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Resolves service account, project id, database id, and client in one call. */
export function bootstrapFirestoreFromCli() {
  const serviceAccount = getServiceAccount();
  const projectId = getProjectId(serviceAccount);
  const databaseId = getDatabaseId();
  const db = createFirestoreFromCli(projectId, databaseId, serviceAccount);
  return { db, projectId, databaseId, serviceAccount };
}

export async function upsertContests(db: Firestore, payload: { races?: any[]; ballotMeasures?: any[] }) {
  let batch = db.batch();
  let writes = 0;
  const identityConflicts: Array<{ raceId: string; existingId: string; incomingId: string; fecCandidateId: string }> = [];

  async function queueSet(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
    batch.set(ref, data, { merge: true });
    writes += 1;

    if (writes >= 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  for (const r of payload.races ?? []) {
    const ref = db.doc(`races/${r.id}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;
    const preserved: Record<string, unknown> = {};
    if (existing && typeof r.status === 'undefined' && typeof existing.status !== 'undefined') preserved.status = existing.status;
    if (existing && typeof r.winnerId === 'undefined' && typeof existing.winnerId !== 'undefined') preserved.winnerId = existing.winnerId;
    const predictionRefs = await db.collection('predictions').where('targetId', '==', r.id).get();
    const protectedCandidateIds = new Set(predictionRefs.docs
      .map((prediction) => prediction.get('pick'))
      .filter((pick): pick is string => typeof pick === 'string' && pick.length > 0));
    const reconciliation = reconcileCandidates(
      Array.isArray(existing?.candidates) ? existing.candidates as CandidateRecord[] : [],
      Array.isArray(r.candidates) ? r.candidates as CandidateRecord[] : [],
      protectedCandidateIds,
    );
    identityConflicts.push(...reconciliation.identityConflicts.map((conflict) => ({ raceId: r.id, ...conflict })));
    await queueSet(
      ref,
      {
        ...r,
        ...preserved,
        candidates: reconciliation.candidates,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
  }

  for (const m of payload.ballotMeasures ?? []) {
    const ref = db.doc(`ballotMeasures/${m.id}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;
    const preserved: Record<string, unknown> = {};
    if (existing && typeof m.status === 'undefined' && typeof existing.status !== 'undefined') preserved.status = existing.status;
    if (existing && typeof m.result === 'undefined' && typeof existing.result !== 'undefined') preserved.result = existing.result;
    await queueSet(
      ref,
      {
        ...m,
        ...preserved,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
  }

  if (writes > 0) {
    await batch.commit();
  }
  return { identityConflicts };
}
