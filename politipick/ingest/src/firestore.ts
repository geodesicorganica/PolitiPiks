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
  const batch = db.batch();

  for (const r of payload.races) {
    const ref = db.doc(`races/${r.id}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;
    const preserved = existing
      ? {
          status: existing.status,
          winnerId: existing.winnerId,
        }
      : {};
    batch.set(
      ref,
      {
        ...r,
        ...preserved,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  for (const m of payload.ballotMeasures) {
    const ref = db.doc(`ballotMeasures/${m.id}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;
    const preserved = existing
      ? {
          status: existing.status,
          result: existing.result,
        }
      : {};
    batch.set(
      ref,
      {
        ...m,
        ...preserved,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}
