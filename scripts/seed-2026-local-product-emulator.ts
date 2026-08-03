import { readFileSync } from 'node:fs';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { assertLoopbackEmulatorHost, decodeLocalProductValue, seedLocalProductBundle } from './lib/localProductEmulator.js';

assertLoopbackEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST);
const input = process.argv[2] ?? '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json';
const bundle = JSON.parse(readFileSync(input, 'utf8'));
const db = new Firestore({
  projectId: process.env.G7_LOCAL_PROJECT_ID ?? 'politipiks',
  databaseId: process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a',
  // Explicit throwaway credentials prevent ADC/metadata probing. The Firestore
  // transport is already fail-closed to a loopback emulator above.
  credentials: { client_email: 'local-emulator@invalid', private_key: 'local-emulator-only' },
});
const result = await seedLocalProductBundle({ async commit(documents) { const batch = db.batch(); for (const document of documents) batch.set(db.doc(document.path), decodeLocalProductValue(document.data, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds)) as FirebaseFirestore.DocumentData); await batch.commit(); } }, bundle);
console.log(JSON.stringify({ operation: 'seed-local-product-emulator', emulatorHost: process.env.FIRESTORE_EMULATOR_HOST, productionFirebaseInitialized: false, ...result }, null, 2));
