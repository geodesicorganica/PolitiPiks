import {readFileSync} from 'node:fs';
import process from 'node:process';
import admin from 'firebase-admin';
import {Firestore} from '@google-cloud/firestore';

function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const uid = getArg('--uid');
if (!uid) {
  console.error('Usage: npm run grant-admin -- --uid <FIREBASE_AUTH_UID> [--service-account <path/to/serviceAccount.json>]');
  process.exit(1);
}

const serviceAccountPath = getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountPath) {
  console.error('Missing service account. Provide --service-account <path> or set FIREBASE_SERVICE_ACCOUNT env var.');
  process.exit(1);
}

const raw = readFileSync(serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(raw);

function getDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;

  try {
    const firebaseJsonRaw = readFileSync('firebase.json', 'utf8');
    const firebaseJson = JSON.parse(firebaseJsonRaw);
    const db = firebaseJson?.firestore?.[0]?.database;
    if (typeof db === 'string' && db.length > 0) return db;
  } catch {
    // ignore
  }

  return '(default)';
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const databaseId = getDatabaseId();

// Use explicit databaseId to match firebase.json and deployed rules.
const db = new Firestore({
  projectId: serviceAccount.project_id,
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
  },
  databaseId,
});

await db.doc(`admins/${uid}`).set(
  {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  {merge: true},
);

console.log(`Granted admin to uid=${uid} (created/updated admins/${uid}) on database=${databaseId}.`);
