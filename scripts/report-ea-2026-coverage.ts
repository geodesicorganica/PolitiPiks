import { readFileSync, writeFileSync } from 'node:fs';
import { assessRelease, EA_SCOPES } from './lib/ea2026Release.js';

const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const input = option('--input'), out = option('--out'), captures = option('--captures');
if (!input || !out || !captures) throw new Error('--input, --out, --captures required');
const release = JSON.parse(readFileSync(input, 'utf8'));
const report = assessRelease(release);
const capture = JSON.parse(readFileSync(captures, 'utf8'));
const perState = release.coverage.map(state => {
  const sources = capture.captures.filter(x => x.state === state.state);
  const contests = release.contests.filter(c => c.state === state.state);
  return { state: state.state, sourcesCaptured: sources.filter(x => x.status === 'captured_unreviewed').length, sourceErrors: sources.filter(x => x.status !== 'captured_unreviewed').length, scopes: Object.fromEntries(EA_SCOPES.map(scope => [scope, state.scopes[scope].status])), expectedContests: Object.values(state.scopes).reduce((n: number, scope: any) => n + scope.expectedContestIds.length, 0), importedContests: contests.length, ballotCandidates: contests.reduce((n, c) => n + c.candidates.length, 0) };
});
const result = { contract: 'politipiks-ea-coverage/v1', asOf: release.asOf, releaseId: release.releaseId, releaseReady: report.releaseReady, reviewedStates: report.reviewedStates, importedContests: report.importedContests, candidates: report.candidates, profilesReviewed: report.profilesReviewed, productionVerified: false, captureSummary: { total: capture.captures.length, captured: capture.captures.filter(x => x.status === 'captured_unreviewed').length, errors: capture.captures.filter(x => x.status !== 'captured_unreviewed').length }, perState, blockers: report.blockers };
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ releaseReady: result.releaseReady, importedContests: result.importedContests, candidates: result.candidates, profilesReviewed: result.profilesReviewed, blockers: result.blockers.length, productionVerified: false }));
