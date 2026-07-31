import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { buildResearchMetricsBaseline, validateResearchMetricsBaselineSnapshot } from './lib/researchMetricsBaseline.js';

const privateRoot = resolve(process.cwd(), '.artifacts', 'private', 'canonical-migration');
type Options = { snapshotIn: string; snapshotOut?: string; reportOut?: string; state?: string; dryRun: boolean; verifyReplay: boolean };
function privatePath(value: string, flag: string) {
  const path = resolve(process.cwd(), value); const child = relative(privateRoot, path);
  if (!child || child.startsWith('..') || !path.toLowerCase().endsWith('.json')) throw new Error(`${flag} must be a .json file beneath .artifacts/private/canonical-migration/`);
  return path;
}
function parse(args: string[]): Options {
  const result: Partial<Options> = { dryRun: false, verifyReplay: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--dry-run') { if (result.dryRun) throw new Error('duplicate --dry-run'); result.dryRun = true; continue; }
    if (flag === '--verify-replay') { if (result.verifyReplay) throw new Error('duplicate --verify-replay'); result.verifyReplay = true; continue; }
    if (!['--snapshot-in', '--snapshot-out', '--report-out', '--state'].includes(flag)) throw new Error(`unsupported argument: ${flag}`);
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    if (flag === '--snapshot-in') { if (result.snapshotIn) throw new Error('duplicate --snapshot-in'); result.snapshotIn = privatePath(value, flag); }
    if (flag === '--snapshot-out') { if (result.snapshotOut) throw new Error('duplicate --snapshot-out'); result.snapshotOut = privatePath(value, flag); }
    if (flag === '--report-out') { if (result.reportOut) throw new Error('duplicate --report-out'); result.reportOut = privatePath(value, flag); }
    if (flag === '--state') { if (result.state || !/^[A-Z]{2}$/.test(value)) throw new Error('state must be one uppercase postal abbreviation'); result.state = value; }
  }
  if (!result.snapshotIn) throw new Error('usage: --snapshot-in <private publication snapshot> [--state <US>] [--dry-run] [--snapshot-out <private json>] [--report-out <private json>] [--verify-replay]');
  if (result.dryRun && (result.snapshotOut || result.reportOut)) throw new Error('--dry-run cannot write an output artifact');
  return result as Options;
}
function writeExclusive(path: string, value: unknown) { mkdirSync(privateRoot, { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }
function stateReport(plan: ReturnType<typeof buildResearchMetricsBaseline>, state?: string) {
  const documents = state ? plan.documents.filter((document) => document.path.includes(`/2026-${state}-`) || document.path.includes(`/2026-${state}-proposition-`)) : plan.documents;
  return { operation: 'offline-research-metrics-baseline', dryRun: true, firebaseInitialized: false, state: state ?? 'all', inputDigest: plan.inputDigest, evidenceDigest: plan.evidenceDigest, planDigest: plan.planDigest, coverage: plan.coverage, audit: plan.audit, selectedDocuments: documents.length };
}

const options = parse(process.argv.slice(2));
if ([options.snapshotOut, options.reportOut].some((path) => path && existsSync(path))) throw new Error('baseline output already exists; refusing to overwrite evidence');
const snapshot = validateResearchMetricsBaselineSnapshot(JSON.parse(readFileSync(options.snapshotIn, 'utf8')));
const first = buildResearchMetricsBaseline(snapshot);
if (options.verifyReplay) {
  const second = buildResearchMetricsBaseline(snapshot);
  if (first.inputDigest !== second.inputDigest || first.evidenceDigest !== second.evidenceDigest || first.planDigest !== second.planDigest || JSON.stringify(first.coverage) !== JSON.stringify(second.coverage)) throw new Error('offline baseline replay is not deterministic');
}
const report = stateReport(first, options.state);
if (options.snapshotOut) writeExclusive(options.snapshotOut, { schemaVersion: 1, sourceSnapshotInputDigest: snapshot.inputDigest, ...first });
if (options.reportOut) writeExclusive(options.reportOut, report);
console.log(JSON.stringify(report, null, 2));
