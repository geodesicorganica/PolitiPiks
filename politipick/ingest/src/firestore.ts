import { Firestore, FieldValue } from '@google-cloud/firestore';

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

export async function upsertContests(db: Firestore, payload: { races: any[]; ballotMeasures: any[] }) {
  let batch = db.batch();
  let writes = 0;

  async function queueSet(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
    batch.set(ref, data, { merge: true });
    writes += 1;

    if (writes >= 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  for (const r of payload.races) {
    const ref = db.doc(`races/${r.id}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;
    const preserved: Record<string, unknown> = {};
    if (existing && typeof r.status === 'undefined' && typeof existing.status !== 'undefined') preserved.status = existing.status;
    if (existing && typeof r.winnerId === 'undefined' && typeof existing.winnerId !== 'undefined') preserved.winnerId = existing.winnerId;
    await queueSet(
      ref,
      {
        ...r,
        ...preserved,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
  }

  for (const m of payload.ballotMeasures) {
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
}
