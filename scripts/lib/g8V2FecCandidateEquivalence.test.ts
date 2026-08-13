import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildG8V2ConflictCertifiedPlan } from './g8V2ConflictCli.js';
import { G8_V2_DISPOSITION_DEFAULT_PATHS } from './g8V2ConflictDisposition.js';
import { localProductDigest } from './localProductBundle.js';
import { diffG8V2FecEquivalentValues, loadG8V2RevisedDispositionPlan, verifyG8V2RevisedDispositionReplay } from './g8V2FecCandidateEquivalence.js';

type Json = Record<string, unknown>;
const d = (value: unknown) => localProductDigest(value);
const candidate = (id: string, fecCandidateId: string, extra: Json = {}) => ({ id, name: 'diagnostic-only', party: 'diagnostic-only', incumbent: false, externalIds: { fecCandidateId, bioguideId: 'diagnostic-only' }, ...extra });

const fecA = 'H6ZZ00001';
const fecB = 'H6ZZ00002';
const acceptedA = new Set([d(fecA)]);
const equivalent = diffG8V2FecEquivalentValues(
  { candidates: [candidate('legacy-a', fecA)] },
  { candidates: [candidate(`fec-${fecA}`, fecA, { pickEligibility: 'ineligible', qualificationStatus: 'filed', visibility: 'visible' })] },
  acceptedA,
);
assert.equal(equivalent.some((difference) => difference.kind === 'identity'), false, 'accepted FEC equivalence must convert candidate identity to pointer-level comparisons');
assert.ok(equivalent.some((difference) => difference.pointer.includes('@fec-sha256:') && difference.pointer.endsWith('/id') && difference.kind === 'value'));
assert.ok(equivalent.some((difference) => difference.pointer.endsWith('/pickEligibility') && difference.kind === 'expected-only'));

const diagnosticOnly = diffG8V2FecEquivalentValues(
  { candidates: [candidate('same-name', fecA)] },
  { candidates: [candidate('same-name', fecB)] },
  new Set(),
);
assert.ok(diagnosticOnly.some((difference) => difference.kind === 'identity'), 'name, party, incumbent, order, and Bioguide corroboration must not establish identity');

const duplicate = diffG8V2FecEquivalentValues(
  { candidates: [candidate('legacy-a', fecA), candidate('legacy-a-duplicate', fecA)] },
  { candidates: [candidate(`fec-${fecA}`, fecA)] },
  acceptedA,
);
assert.ok(duplicate.some((difference) => difference.kind === 'identity' && difference.identitySide === 'invalid-or-duplicate'));

const reorder = diffG8V2FecEquivalentValues(
  { candidates: [candidate('legacy-b', fecB), candidate('legacy-a', fecA)] },
  { candidates: [candidate(`fec-${fecA}`, fecA), candidate(`fec-${fecB}`, fecB)] },
  new Set([d(fecA), d(fecB)]),
);
assert.ok(reorder.some((difference) => difference.kind === 'reorder'));

const paths = G8_V2_DISPOSITION_DEFAULT_PATHS;
const { plan: activationPlan } = buildG8V2ConflictCertifiedPlan(paths.currentBundle, paths.manifest);
const plan = loadG8V2RevisedDispositionPlan(paths, activationPlan);
const snapshot = JSON.parse(readFileSync(paths.snapshot, 'utf8')) as { conflicts: Array<{ family: string; actual: Json; expected: Json }> };
const raceConflicts = snapshot.conflicts.filter((conflict) => conflict.family === 'races');
let derivedAcceptedPairs = 0;
let derivedFullyResolvedRaces = 0;
for (const conflict of raceConflicts) {
  const actualCandidates = Array.isArray(conflict.actual.candidates) ? conflict.actual.candidates as Json[] : [];
  const certifiedCandidates = Array.isArray(conflict.expected.candidates) ? conflict.expected.candidates as Json[] : [];
  const fec = (value: Json) => typeof (value.externalIds as Json | undefined)?.fecCandidateId === 'string' ? String((value.externalIds as Json).fecCandidateId) : '';
  const actual = new Map<string, number>(); const certified = new Map<string, number>();
  for (const value of actualCandidates) actual.set(fec(value), (actual.get(fec(value)) ?? 0) + 1);
  for (const value of certifiedCandidates) certified.set(fec(value), (certified.get(fec(value)) ?? 0) + 1);
  const accepted = [...actual].filter(([id, count]) => /^[HS]\d[A-Z]{2}\d{5}$/.test(id) && count === 1 && certified.get(id) === 1).length;
  derivedAcceptedPairs += accepted;
  if (accepted === actualCandidates.length && accepted === certifiedCandidates.length) derivedFullyResolvedRaces += 1;
}
assert.equal(plan.equivalence.aggregate.acceptedFecPairs, derivedAcceptedPairs, 'observed pair count must be derived from the validated snapshot');
assert.equal(plan.equivalence.aggregate.fullyResolvedRaces, derivedFullyResolvedRaces, 'observed fully resolved races must be derived rather than hard-coded');
assert.equal(plan.equivalence.aggregate.fullyResolvedRaces + plan.equivalence.aggregate.remainingRaces, raceConflicts.length);
assert.equal(plan.equivalence.aggregate.acceptedFecPairs + plan.equivalence.aggregate.rejectedFecPairs, plan.equivalence.pairs.length);
assert.ok(plan.equivalence.aggregate.acceptedFecPairs > 0 && plan.equivalence.aggregate.rejectedFecPairs > 0);
assert.equal(plan.equivalence.aggregate.seatMismatches, 0);
assert.equal(plan.equivalence.aggregate.contradictoryEvidence, 0);
assert.equal(plan.equivalence.aggregate.reusedFecIds, 0);
assert.equal(plan.readiness.unresolved, plan.equivalence.aggregate.remainingRaces);
assert.equal(plan.readiness.nextEvidenceBatches.length, plan.equivalence.aggregate.remainingRaces);
assert.equal(plan.aggregate.byDisposition['deterministic-merge'] + plan.aggregate.byDisposition['replace-with-certified'] + plan.aggregate.byDisposition['preserve-current'], plan.readiness.deterministicallyResolved);
assert.equal(plan.readiness.readyForExecutor, false);
assert.equal(plan.safety.firebaseImported, false);
assert.equal(plan.safety.credentialsLoaded, false);
assert.equal(plan.safety.networkRequests, 0);
assert.equal(plan.safety.productionOperations, 0);
assert.ok(plan.entries.every((entry) => entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot' && /^[a-f0-9]{64}$/.test(entry.rollbackDigest)));
assert.equal(/[HS]\d[A-Z]{2}\d{5}/.test(JSON.stringify(plan.equivalence)), false, 'equivalence evidence must retain only digests, never raw FEC IDs');
assert.equal(verifyG8V2RevisedDispositionReplay({ digests: structuredClone(plan.digests) }, { digests: structuredClone(plan.digests) }), true);

console.log(JSON.stringify({
  operation: 'g8-4br6b-focused-tests',
  equivalence: plan.equivalence.aggregate,
  dispositions: plan.aggregate.byDisposition,
  policyConflicts: plan.readiness.policyConflicts,
  readyForExecutor: plan.readiness.readyForExecutor,
  planDigest: plan.digests.plan,
}));
