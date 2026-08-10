import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildG8V2ConflictAnalysisReport } from './lib/g8V2ConflictAnalysis.js';
import { assertG8V2ConflictLiveGuards, buildG8V2ConflictCertifiedPlan, parseG8V2ConflictCliArguments } from './lib/g8V2ConflictCli.js';

const args = parseG8V2ConflictCliArguments(process.argv.slice(2));
const { plan } = buildG8V2ConflictCertifiedPlan(args.bundlePath, args.manifestPath);

if (args.mode === 'snapshot-in') {
  const snapshot = JSON.parse(readFileSync(args.snapshotPath, 'utf8')) as unknown;
  const comparisons = args.comparisons.map(({ label, path }) => ({ label, value: JSON.parse(readFileSync(path, 'utf8')) as unknown }));
  const report = buildG8V2ConflictAnalysisReport(snapshot, plan, comparisons);
  if (args.verifyReplay) {
    const replay = buildG8V2ConflictAnalysisReport(JSON.parse(JSON.stringify(snapshot)) as unknown, plan, comparisons.map((item) => ({ label: item.label, value: JSON.parse(JSON.stringify(item.value)) as unknown })));
    if (JSON.stringify(report) !== JSON.stringify(replay)) throw new Error('offline conflict analysis replay is not deterministic');
  }
  process.stdout.write(`${JSON.stringify({ ...report, operation: 'g8-4br5a-offline-conflict-analysis', offlineReplayVerified: args.verifyReplay }, null, 2)}\n`);
} else {
  const identity = assertG8V2ConflictLiveGuards(args, plan);
  // Deliberately dynamic: no Firebase/bootstrap/environment module is imported
  // until every bundle, manifest, identity, target, and output-path guard passes.
  const { captureG8V2ConflictsLive } = await import('./lib/g8V2ConflictCaptureLive.js');
  const snapshot = await captureG8V2ConflictsLive({
    plan,
    capture: {
      captureReceipt: identity.captureReceipt,
      projectId: plan.target.projectId,
      databaseId: plan.target.databaseId,
      generation: plan.generation,
      shadowSourceCommit: plan.shadowSourceCommit,
      activationImplementationCommit: plan.activationImplementationCommit,
      conflictAnalysisImplementationCommit: identity.conflictAnalysisImplementationCommit,
    },
  });
  mkdirSync(dirname(args.snapshotPath), { recursive: true });
  writeFileSync(args.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ operation: 'g8-4br5b-future-conflict-capture', contract: snapshot.contract, counts: snapshot.counts, readAccounting: snapshot.readAccounting, writeAccounting: snapshot.writeAccounting, digests: snapshot.digests }, null, 2)}\n`);
}
