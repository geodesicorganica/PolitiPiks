import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  buildCanonicalMigrationReport,
  buildCanonicalMigrationSnapshot,
  encodeFirestoreSnapshotValue,
  type CanonicalMigrationSnapshot,
} from './lib/canonicalMigration.js';

type Arguments = { snapshotIn?: string; snapshotOut?: string; approvedSnapshot?: string; verifyReplay: boolean };
const snapshotRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');

function parseArguments(argv: string[]): Arguments {
  const args: Arguments = { verifyReplay: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--verify-replay') { args.verifyReplay = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--snapshot-in') args.snapshotIn = value;
    else if (flag === '--snapshot-out') args.snapshotOut = value;
    else if (flag === '--approved-snapshot') args.approvedSnapshot = value;
    else throw new Error(`unsupported argument: ${flag}`);
    index += 1;
  }
  if (args.snapshotIn && args.snapshotOut) throw new Error('use either --snapshot-in (offline) or --snapshot-out (one live capture), not both');
  if (!args.snapshotIn && !args.snapshotOut) throw new Error('supply --snapshot-in <file> for offline replay or --snapshot-out <file> for one live capture');
  return args;
}

function readSnapshot(path: string): CanonicalMigrationSnapshot {
  return JSON.parse(readFileSync(path, 'utf8')) as CanonicalMigrationSnapshot;
}

export function resolvePrivateSnapshotOutputPath(path: string) {
  const resolved = resolve(process.cwd(), path);
  const relativePath = relative(snapshotRoot, resolved);
  if (!relativePath || relativePath.startsWith('..') || resolve(snapshotRoot, relativePath) !== resolved) {
    throw new Error(`--snapshot-out must be beneath ${snapshotRoot}`);
  }
  if (!resolved.toLowerCase().endsWith('.json')) throw new Error('--snapshot-out must name a .json file');
  return resolved;
}

async function captureLiveSnapshot(): Promise<CanonicalMigrationSnapshot> {
  // Deliberately dynamic: --snapshot-in must not load Firestore bootstrap,
  // credentials, or the Admin SDK module graph.
  const { bootstrapFirestore } = await import('./lib/firestoreCli.js');
  const { db, projectId, databaseId } = bootstrapFirestore();
  const identityOverrides = JSON.parse(readFileSync(new URL('../data/2026/canonical-identity-overrides.json', import.meta.url), 'utf8'));
  // This is the only live-read path. All subsequent report work is offline.
  const [raceSnapshot, predictionSnapshot, candidateResearchSnapshot, contestMetricsSnapshot] = await Promise.all([
    db.collection('races').where('electionYear', '==', 2026).where('mode', '==', 'live').get(),
    db.collection('predictions').get(),
    db.collectionGroup('candidateResearch').get(),
    db.collection('contestMetrics').get(),
  ]);
  return buildCanonicalMigrationSnapshot({
    projectId,
    databaseId,
    races: raceSnapshot.docs.map((race) => ({ id: race.id, ...race.data() })),
    predictions: predictionSnapshot.docs.map((prediction) => ({ id: prediction.id, ...prediction.data() })),
    candidateResearch: candidateResearchSnapshot.docs.map((research) => ({
      id: research.id, raceId: research.ref.parent.parent?.id ?? research.get('raceId'), candidateId: research.get('candidateId') ?? research.id, data: encodeFirestoreSnapshotValue(research.data(), `candidateResearch/${research.id}`) as Record<string, unknown>,
    })),
    contestMetrics: contestMetricsSnapshot.docs.map((metric) => ({ id: metric.id, raceId: metric.get('raceId') ?? metric.id, data: encodeFirestoreSnapshotValue(metric.data(), `contestMetrics/${metric.id}`) as Record<string, unknown> })),
    overrides: identityOverrides,
  });
}

const args = parseArguments(process.argv.slice(2));
const snapshotOutPath = args.snapshotOut ? resolvePrivateSnapshotOutputPath(args.snapshotOut) : undefined;
const snapshot = args.snapshotIn ? readSnapshot(args.snapshotIn) : await captureLiveSnapshot();
if (snapshotOutPath) {
  mkdirSync(snapshotRoot, { recursive: true });
  writeFileSync(snapshotOutPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}
const report = buildCanonicalMigrationReport(snapshot);
if (args.verifyReplay) {
  const replay = buildCanonicalMigrationReport(JSON.parse(JSON.stringify(snapshot)) as CanonicalMigrationSnapshot);
  if (JSON.stringify(report) !== JSON.stringify(replay) || report.inputDigest !== replay.inputDigest || report.planDigest !== replay.planDigest) {
    throw new Error('offline snapshot replay is not deterministic');
  }
}

if (args.approvedSnapshot) {
  const approved = buildCanonicalMigrationReport(readSnapshot(args.approvedSnapshot));
  if (report.inputDigest !== approved.inputDigest || report.planDigest !== approved.planDigest) {
    throw new Error(`snapshot does not match approved plan: input=${report.inputDigest}/${approved.inputDigest}, plan=${report.planDigest}/${approved.planDigest}`);
  }
}

console.log(JSON.stringify({
  ...report,
  snapshot: args.snapshotIn ? { mode: 'offline-replay', path: args.snapshotIn } : { mode: 'live-capture', path: snapshotOutPath },
  ...(args.verifyReplay ? { offlineReplayVerified: true } : {}),
  ...(args.approvedSnapshot ? { approvedSnapshot: { path: args.approvedSnapshot, matchedInputAndPlanDigests: true } } : {}),
}, null, 2));
