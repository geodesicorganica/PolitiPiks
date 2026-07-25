import { readFileSync } from 'node:fs';
import process from 'node:process';
import { buildCanonicalShadowPlan, type CanonicalMigrationSnapshot } from './lib/canonicalMigration.js';
import { buildCanonicalShadowWritePlan } from './lib/canonicalShadowExecutor.js';
import { auditCanonicalPublicationPlan, type CanonicalPublicationPlan } from './lib/canonicalPublication.js';
import { resolvePrivateSnapshotInputPath } from './lib/canonicalShadowCli.js';

const [flag, rawPath] = process.argv.slice(2);
if (flag !== '--snapshot-in' || !rawPath || process.argv.length !== 4) throw new Error('usage: --snapshot-in <private ignored snapshot>');
const snapshotPath = resolvePrivateSnapshotInputPath(rawPath);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as CanonicalMigrationSnapshot;
const shadow = buildCanonicalShadowWritePlan(snapshot, 'fdb824d6512d33d78eb12f5766088712aa549d2c');
const documents = shadow.documents.map((document) => ({
  path: document.path.replace(/^migrationShadows\/canonical-2026-shadow-v1\//, ''), data: document.data,
}));
const plan = {
  schemaVersion: 3,
  generation: 'canonical-2026-shadow-v1',
  documents,
  inputDigest: shadow.snapshot.inputDigest,
  mappingDigest: shadow.mappingDigest,
  planDigest: shadow.planDigest,
  mapping: { ...buildCanonicalShadowPlan(snapshot.inputs), publicationCandidateConflicts: [], activeCandidates: new Set<string>() },
  sourceCandidateCount: snapshot.inputs.races.reduce((count, race) => count + race.candidates.length, 0),
  expectedCounts: shadow.expectedCounts,
} as unknown as CanonicalPublicationPlan;
const audit = auditCanonicalPublicationPlan(plan);
console.log(JSON.stringify({ operation: 'offline-publication-audit', snapshotSchemaVersion: snapshot.schemaVersion, ...audit }, null, 2));
