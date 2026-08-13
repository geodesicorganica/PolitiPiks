import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadG8V2ExecutorReadinessInputs, verifyG8V2ExecutorReadiness } from './g8V2ExecutorReadinessReview.js';

const inputs = loadG8V2ExecutorReadinessInputs();
const baseline = verifyG8V2ExecutorReadiness(inputs);
assert.equal(baseline.verdict, 'PASS');
assert.deepEqual(baseline.counts, { paths: 858, races: 429, metrics: 429, fecEquivalentRaces: 425, fecPairs: 2097, overrides: 8, replacements: 4, merges: 854, discardedProductionFields: 12, preservedProductionFields: 10177 });

function tamper(label: string, mutate: (value: any) => () => void, pattern: RegExp) {
  const restore = mutate(inputs as any);
  try { assert.throws(() => verifyG8V2ExecutorReadiness(inputs), pattern, label); } finally { restore(); }
}

tamper('output digest', (value) => { const prior = value.plan.entries[0].proposedOutputDigest; value.plan.entries[0].proposedOutputDigest = '0'.repeat(64); return () => { value.plan.entries[0].proposedOutputDigest = prior; }; }, /BR7A_PROPOSED_OUTPUT_DIGEST_MISMATCH/);
tamper('rollback digest', (value) => { const prior = value.plan.entries[0].rollbackDigest; value.plan.entries[0].rollbackDigest = '0'.repeat(64); return () => { value.plan.entries[0].rollbackDigest = prior; }; }, /BR7A_ROLLBACK_DIGEST_MISMATCH/);
tamper('path omission', (value) => { const prior = value.plan.entries.pop(); return () => { value.plan.entries.push(prior); }; }, /BR7A_PLAN_INVENTORY_INVALID/);
tamper('duplicate path', (value) => { const prior = value.plan.entries[1].path; value.plan.entries[1].path = value.plan.entries[0].path; return () => { value.plan.entries[1].path = prior; }; }, /BR7A_PLAN_INVENTORY_INVALID/);
tamper('override substitution', (value) => { const prior = value.overrides.candidateOverrides[0].fecCandidateId; value.overrides.candidateOverrides[0].fecCandidateId = 'H0ZZ00000'; return () => { value.overrides.candidateOverrides[0].fecCandidateId = prior; }; }, /BR7A_OVERRIDE_SOURCE_NOT_EXACT_FEC|BR7A_OVERRIDE_CANONICAL_TARGET_NOT_UNIQUE/);
tamper('merge group alteration', (value) => { const item = value.overrides.candidateOverrides.find((entry: any) => entry.approvedManyToOneMerge); const prior = item.approvedManyToOneMerge; item.approvedManyToOneMerge = `${prior}-tamper`; return () => { item.approvedManyToOneMerge = prior; }; }, /BR7A_UNAPPROVED_MANY_TO_ONE|BR7A_IDENTITY_RESOLUTION_MISMATCH/);
tamper('protected field mutation', (value) => { const entry = value.plan.entries.find((item: any) => item.disposition === 'deterministic-merge'); const rule = entry.pointerRules.find((item: any) => item.kind === 'production-only'); const prior = rule.pointer; rule.pointer = '/id'; return () => { rule.pointer = prior; }; }, /BR7A_POINTER_RULE_DIFFERENCE_MISMATCH/);
tamper('stale runtime metadata', (value) => { const entry = value.plan.entries.find((item: any) => item.disposition === 'replace-with-certified'); const rule = entry.pointerRules.find((item: any) => item.pointer === '/updatedAt/seconds'); const prior = rule.provenanceClass; rule.provenanceClass = 'runtime-metadata'; return () => { rule.provenanceClass = prior; }; }, /BR7A_ENTRY_EVIDENCE_OR_SIGNATURE_INVALID|BR7A_UNEXPECTED_DISPOSITION|BR7A_HYBRID_REPLACEMENT_OUTPUT|BR7A_STALE_RUNTIME_METADATA_DISPOSITION/);
tamper('input hash drift', (value) => { const prior = value.identities.plan.sha256; value.identities.plan.sha256 = '0'.repeat(64); return () => { value.identities.plan.sha256 = prior; }; }, /BR7A_INPUT_IDENTITY_DRIFT_PLAN/);
tamper('unknown plan field', (value) => { value.plan.executor = {}; return () => { delete value.plan.executor; }; }, /BR7A_PLAN_KEY_SET_MISMATCH/);
tamper('entry ordering', (value) => { [value.plan.entries[0], value.plan.entries[1]] = [value.plan.entries[1], value.plan.entries[0]]; return () => { [value.plan.entries[0], value.plan.entries[1]] = [value.plan.entries[1], value.plan.entries[0]]; }; }, /BR7A_PLAN_INVENTORY_INVALID/);

const implementation = readFileSync('scripts/lib/g8V2ExecutorReadinessReview.ts', 'utf8');
const reporter = readFileSync('scripts/report-g8-4br7a-executor-readiness.ts', 'utf8');
for (const source of [implementation, reporter]) {
  assert.doesNotMatch(source, /from ['"](?:firebase|@google-cloud\/firestore|node:(?:http|https|net|dns|child_process))['"]/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest)\s*\(/);
}

console.log('g8V2ExecutorReadinessReview tests passed');
