import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { encodeFirestoreSnapshotValue } from './lib/canonicalMigration.js';
import { auditCanonicalPublicationPlan, buildCanonicalPublicationPlan, buildCanonicalPublicationSnapshot, certifyCanonicalPublicationPlan, type CanonicalPublicationSnapshot, validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { deadlineCoverageReport, generateDeadlineRecords, validateProductLockPolicy } from './lib/deadlineRegistry.js';

const PROJECT_ID = 'politipiks';
const DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
type Mode = 'snapshot-in' | 'snapshot-out';
type Options = { mode: Mode; snapshotPath: string; verifyReplay: boolean; approvedSnapshot?: string; approveSnapshot?: string; projectId?: string; databaseId?: string };

function privatePath(value: string, label: string) {
  const resolved = resolve(process.cwd(), value);
  const child = relative(privateRoot, resolved);
  if (!child || child.startsWith('..') || !resolved.toLowerCase().endsWith('.json')) throw new Error(`${label} must be a .json file beneath .artifacts/private/canonical-migration/`);
  return resolved;
}
function parseArgs(args: string[]): Options {
  let mode: Mode | undefined; let snapshotPath: string | undefined; let verifyReplay = false; let approvedSnapshot: string | undefined; let approveSnapshot: string | undefined; let projectId: string | undefined; let databaseId: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--verify-replay') { if (verifyReplay) throw new Error('duplicate --verify-replay'); verifyReplay = true; continue; }
    if (!['--snapshot-in', '--snapshot-out', '--approved-snapshot', '--approve-snapshot', '--project-id', '--database-id'].includes(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--snapshot-in' || flag === '--snapshot-out') { if (mode) throw new Error('provide exactly one snapshot mode'); mode = flag.slice(2) as Mode; snapshotPath = privatePath(value, flag); }
    if (flag === '--approved-snapshot') { if (approvedSnapshot) throw new Error('duplicate --approved-snapshot'); approvedSnapshot = privatePath(value, flag); }
    if (flag === '--approve-snapshot') { if (approveSnapshot) throw new Error('duplicate --approve-snapshot'); approveSnapshot = privatePath(value, flag); }
    if (flag === '--project-id') { if (projectId) throw new Error('duplicate --project-id'); projectId = value; }
    if (flag === '--database-id') { if (databaseId) throw new Error('duplicate --database-id'); databaseId = value; }
  }
  if (!mode || !snapshotPath) throw new Error('usage: --snapshot-in|--snapshot-out <private .json> [--verify-replay] [--approved-snapshot <private .json>]');
  if (mode === 'snapshot-out' && (!projectId || !databaseId)) throw new Error('live publication capture requires explicit --project-id and --database-id');
  if (approveSnapshot && (mode !== 'snapshot-in' || !verifyReplay)) throw new Error('--approve-snapshot requires offline --snapshot-in with --verify-replay');
  if ((projectId && projectId !== PROJECT_ID) || (databaseId && databaseId !== DATABASE_ID)) throw new Error('unexpected publication capture target');
  return { mode, snapshotPath, verifyReplay, ...(approvedSnapshot ? { approvedSnapshot } : {}), ...(approveSnapshot ? { approveSnapshot } : {}), ...(projectId ? { projectId } : {}), ...(databaseId ? { databaseId } : {}) };
}
function deadlines() {
  return generateDeadlineRecords(JSON.parse(readFileSync('data/2026/jurisdiction-deadlines.json', 'utf8')), { requireComplete: false });
}
function lockPolicy() { return validateProductLockPolicy(JSON.parse(readFileSync('data/2026/jurisdiction-deadlines.json', 'utf8')).productLockPolicy); }
function sourceCommit() { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim(); }
function receipt(snapshot: CanonicalPublicationSnapshot) {
  const validated = validateCanonicalPublicationSnapshot(snapshot);
  const plan = buildCanonicalPublicationPlan(validated.inputs);
  const audit = auditCanonicalPublicationPlan(plan);
  const certification = audit.publicationReady ? certifyCanonicalPublicationPlan(plan, sourceCommit()) : null;
  return {
    operation: 'publication-capture-receipt', schemaVersion: validated.schemaVersion, projectId: validated.projectId, databaseId: validated.databaseId,
    capturedAt: validated.capturedAt, collectionCounts: validated.collectionCounts,
    inputDigest: validated.inputDigest, mappingDigest: plan.mappingDigest, planDigest: plan.planDigest, lockPolicyDigest: plan.lockPolicyDigest, expectedCounts: plan.expectedCounts, audit, publicationReady: audit.publicationReady, certification,
  };
}
function stable(value: unknown) { return JSON.stringify(value); }
function replay(snapshot: CanonicalPublicationSnapshot) {
  const first = receipt(snapshot); const second = receipt(snapshot);
  if (stable(first) !== stable(second)) throw new Error('publication snapshot replay is not deterministic');
  return first;
}
function readSnapshot(path: string) { return validateCanonicalPublicationSnapshot(JSON.parse(readFileSync(path, 'utf8'))); }
function assertApproved(snapshot: CanonicalPublicationSnapshot, approvedPath: string) {
  const approved = readSnapshot(approvedPath);
  const currentReceipt = replay(snapshot); const approvedReceipt = replay(approved);
  const comparable = (value: ReturnType<typeof receipt>) => ({ schemaVersion: value.schemaVersion, projectId: value.projectId, databaseId: value.databaseId, collectionCounts: value.collectionCounts, inputDigest: value.inputDigest, mappingDigest: value.mappingDigest, planDigest: value.planDigest, expectedCounts: value.expectedCounts, audit: value.audit, publicationReady: value.publicationReady, certification: value.certification });
  if (stable(comparable(currentReceipt)) !== stable(comparable(approvedReceipt))) throw new Error('approved publication snapshot differs from the fresh capture');
}
async function capture(options: Options): Promise<CanonicalPublicationSnapshot> {
  // Deliberately the only Firestore/bootstrap import in this file. Offline replay never loads credentials or Firebase.
  const { bootstrapFirestore } = await import('./lib/firestoreCli.js');
  const { db, projectId, databaseId } = bootstrapFirestore();
  if (projectId !== options.projectId || databaseId !== options.databaseId || projectId !== PROJECT_ID || databaseId !== DATABASE_ID) throw new Error('initialized Firestore identity does not match explicit capture identity');
  const [races, predictions, research, metrics] = await Promise.all([
    db.collection('races').where('electionYear', '==', 2026).where('mode', '==', 'live').get(), db.collection('predictions').get(), db.collectionGroup('candidateResearch').get(), db.collection('contestMetrics').get(),
  ]);
  const overrides = JSON.parse(readFileSync('data/2026/canonical-identity-overrides.json', 'utf8'));
  return buildCanonicalPublicationSnapshot({ projectId, databaseId,
    races: races.docs.map((item) => ({ id: item.id, ...(encodeFirestoreSnapshotValue(item.data(), `races/${item.id}`) as Record<string, unknown>) })) as never,
    lockPolicy: lockPolicy(), deadlines: deadlines(), predictions: predictions.docs.map((item) => ({ id: item.id, targetId: item.get('targetId'), pick: item.get('pick') })),
    candidateResearch: research.docs.map((item) => ({ raceId: item.ref.parent.parent?.id ?? '', candidateId: item.get('candidateId') ?? item.id, data: encodeFirestoreSnapshotValue(item.data()) as Record<string, unknown> })),
    contestMetrics: metrics.docs.map((item) => ({ id: item.id, raceId: item.get('raceId') ?? item.id, data: encodeFirestoreSnapshotValue(item.data()) as Record<string, unknown> })), overrides,
  });
}
function writeExclusive(path: string, snapshot: CanonicalPublicationSnapshot) {
  mkdirSync(privateRoot, { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

const options = parseArgs(process.argv.slice(2));
// Refuse an existing output before the live branch can initialize Firestore or read any production data.
if (options.mode === 'snapshot-out' && existsSync(options.snapshotPath)) throw new Error('publication snapshot output already exists; refusing to overwrite evidence');
const snapshot = options.mode === 'snapshot-in' ? readSnapshot(options.snapshotPath) : await capture(options);
const report = options.verifyReplay ? replay(snapshot) : receipt(snapshot);
if (options.approvedSnapshot) assertApproved(snapshot, options.approvedSnapshot);
if (options.mode === 'snapshot-out') writeExclusive(options.snapshotPath, snapshot);
if (options.approveSnapshot) writeExclusive(options.approveSnapshot, snapshot);
console.log(JSON.stringify({ ...report, operation: options.mode === 'snapshot-in' ? 'offline-publication-replay' : 'live-publication-capture' }, null, 2));
