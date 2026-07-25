import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import {
  CANONICAL_DATABASE_ID,
  CANONICAL_PROJECT_ID,
  buildMigrationPlan,
  parseMigrationRequest,
  type MigrationRecord,
} from './close-at-migration-lib.ts';

type AppConfig = { projectId: string; firestoreDatabaseId: string };
type FirebaseJson = { firestore?: Array<{ database?: string }> };
type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string };
type FirestoreRecord = MigrationRecord & { ref: DocumentReference; updateTime: Timestamp };

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function report(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const request = parseMigrationRequest(process.argv.slice(2));
  if (!request.configured) {
    report({
      operation: 'dry-run',
      applied: false,
      configured: false,
      safeguard: 'No Firestore connection or write is attempted until an explicit, fully scoped command is supplied.',
      requiredForApply: ['--apply', '--project-id politipiks', `--database-id ${CANONICAL_DATABASE_ID}`, '--expected-count <n>', '--deadline <ISO-UTC-with-milliseconds>'],
    });
    return;
  }

  const appConfig = json<AppConfig>('firebase-applet-config.json');
  const firebaseJson = json<FirebaseJson>('firebase.json');
  if (appConfig.projectId !== CANONICAL_PROJECT_ID || appConfig.firestoreDatabaseId !== CANONICAL_DATABASE_ID || firebaseJson.firestore?.[0]?.database !== CANONICAL_DATABASE_ID) {
    throw new Error('Refusing migration: checked-in Firebase project or database configuration does not match the approved canonical target.');
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccount = serviceAccountPath ? json<ServiceAccount>(serviceAccountPath) : undefined;
  if (serviceAccount && serviceAccount.project_id !== CANONICAL_PROJECT_ID) {
    throw new Error('Refusing migration: service account project does not match politipiks.');
  }

  const app = getApps().find((item) => item.name === 'close-at-migration') ?? initializeApp(
    serviceAccount
      ? { credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: CANONICAL_PROJECT_ID }
      : { projectId: CANONICAL_PROJECT_ID },
    'close-at-migration',
  );
  const db = getFirestore(app, CANONICAL_DATABASE_ID);

  const snapshots = await Promise.all(['races', 'ballotMeasures'].map(async (collection) => {
    const snapshot = await db.collection(collection)
      .where('electionYear', '==', 2026)
      .where('mode', '==', 'live')
      .get();
    return snapshot.docs.map((item) => ({
      collection: collection as FirestoreRecord['collection'],
      id: item.id,
      closeAt: item.get('closeAt'),
      ref: item.ref,
      updateTime: item.updateTime,
    }));
  }));
  const records = snapshots.flat();
  const plan = buildMigrationPlan(records, { expectedCount: request.expectedCount!, deadline: request.deadline! });
  const audit = {
    operation: request.apply ? 'apply' : 'dry-run',
    applied: false,
    projectId: CANONICAL_PROJECT_ID,
    databaseId: CANONICAL_DATABASE_ID,
    deadline: plan.deadline,
    expectedCount: plan.expectedCount,
    scannedCount: plan.scannedCount,
    pending: plan.pending.map(({ collection, id }) => ({ collection, id })),
    alreadyAtDeadline: plan.alreadyAtDeadline.map(({ collection, id }) => ({ collection, id })),
    conflicts: plan.conflicts,
    errors: plan.errors,
    batchSizeLimit: 400,
    batches: plan.batches.map((batch, index) => ({ number: index + 1, size: batch.length, documents: batch.map(({ collection, id }) => ({ collection, id })) })),
  };

  if (!plan.ok) {
    report(audit);
    process.exitCode = 1;
    return;
  }
  if (!request.apply) {
    report(audit);
    return;
  }

  const deadlineTimestamp = Timestamp.fromDate(request.deadline!);
  const completedBatches: number[] = [];
  try {
    for (let index = 0; index < plan.batches.length; index += 1) {
      const batch = db.batch();
      for (const item of plan.batches[index] as FirestoreRecord[]) {
        // A precondition prevents a concurrent closeAt change from being overwritten.
        batch.update(item.ref, { closeAt: deadlineTimestamp }, { lastUpdateTime: item.updateTime });
      }
      await batch.commit();
      completedBatches.push(index + 1);
    }
  } catch (error) {
    report({ ...audit, applied: false, completedBatches, error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
    return;
  }

  report({ ...audit, applied: true, completedBatches });
}

main().catch((error) => {
  report({ operation: 'dry-run', applied: false, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
