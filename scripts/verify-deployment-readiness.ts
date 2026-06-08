import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

type FirebaseAppletConfig = {
  firestoreDatabaseId?: string;
};

type FirebaseJson = {
  firestore?: Array<{ database?: string }>;
};

type EnvMap = Record<string, string | undefined>;

const unsafeProductionFlags = [
  'VITE_USE_FIREBASE_EMULATORS',
  'VITE_ENABLE_TEST_AUTH',
  'VITE_USE_MOCK_CONTESTS',
  'VITE_ALLOW_ADMIN_SEED',
];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function isTruthyFlag(value: string | undefined) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadEnvFile(path: string): EnvMap {
  if (!existsSync(path)) {
    throw new Error(`Env file not found: ${path}`);
  }
  return parse(readFileSync(path));
}

function assertSafeEnv(sourceName: string, env: EnvMap) {
  const enabled = unsafeProductionFlags.filter((flag) => isTruthyFlag(env[flag]));
  if (enabled.length > 0) {
    throw new Error(`${sourceName} enables production-unsafe flag(s): ${enabled.join(', ')}`);
  }
}

function assertDatabaseConfigMatches() {
  const appConfig = readJson<FirebaseAppletConfig>('firebase-applet-config.json');
  const firebaseJson = readJson<FirebaseJson>('firebase.json');
  const appDatabase = appConfig.firestoreDatabaseId;
  const rulesDatabase = firebaseJson.firestore?.[0]?.database;

  if (!appDatabase) {
    throw new Error('firebase-applet-config.json is missing firestoreDatabaseId.');
  }
  if (!rulesDatabase) {
    throw new Error('firebase.json is missing firestore[0].database.');
  }
  if (appDatabase !== rulesDatabase) {
    throw new Error(`Firestore database mismatch: app=${appDatabase}, firebase.json=${rulesDatabase}.`);
  }
}

assertDatabaseConfigMatches();
assertSafeEnv('process.env', process.env);

const envFile = getArg('--env-file');
if (envFile) {
  assertSafeEnv(envFile, loadEnvFile(envFile));
}

console.log('Deployment readiness checks passed: Firestore database config matches and production-unsafe flags are disabled.');
