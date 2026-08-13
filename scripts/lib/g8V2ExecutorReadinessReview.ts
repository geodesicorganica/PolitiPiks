import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';

type Json = Record<string, any>;

export const G8_BR7A_RECEIPT_CONTRACT = 'g8-4br7a-independent-executor-readiness-receipt/v1' as const;

export const G8_BR7A_PATHS = {
  plan: '.artifacts/private/canonical-migration/g8-4br6cr-build-1-final-identity-plan.json',
  snapshot: '.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json',
  bundle: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  br6bPlan: '.artifacts/private/canonical-migration/g8-4br6b-revised-disposition-plan-build-1.json',
  publication: '.artifacts/private/canonical-migration/g8-1-approved-catalog-beta-2026-08-04.json',
  finance: '.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json',
  overrides: 'data/2026/canonical-identity-overrides.json',
  g2Status: 'docs/status/g2-1-identity-resolution.md',
} as const;

const EXPECTED_IDENTITIES = {
  plan: { bytes: 75_926_293, sha256: '654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec' },
  snapshot: { bytes: 35_148_779, sha256: '425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3' },
  bundle: { bytes: 23_043_218, sha256: '8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4' },
  br6bPlan: { bytes: 81_061_814, sha256: '1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e' },
  publication: { bytes: 10_769_556, sha256: '8f2e5244f49dc011f07bb748ff68f0759dfb002598e923e84019a03a28681ced' },
  finance: { bytes: 2_095_459, sha256: 'c59e666ba636725ae463f0b9e597cbf4b662ea18d03fcf5d0dfcd2d136837878' },
  overrides: { bytes: 2_137, sha256: 'dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77' },
  g2Status: { bytes: 4_627, sha256: '281f0525ac101103ac623c6be5a432507787e6c47f5283fd1fe9c86cb8873077' },
} as const;

const PLAN_DIGEST = 'ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23';
const BR6B_PLAN_DIGEST = '7b5da128cad3ee688949209643ab63626e2a70a18b6765f8a57b9956f162ab48';
const OVERRIDE_MAPPING_DIGEST = '7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a';
const BUNDLE_DIGEST = '7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7';
const PUBLICATION_INPUT_DIGEST = '3117a383c2452e72ec21ab40e52fa113f34114c1ddabc29faaf0f80e262d3ce7';
const FINANCE_INPUT_DIGEST = '4f6daac55ec7ecd34aa5733eb36aee9fc17d6251eeebc7688866ddd5bbbce95b';
const EXCEPTION_RACES = new Set(['2026-CA-house-040', '2026-FL-house-011', '2026-NJ-house-008', '2026-TX-house-022']);
const FEC_ID = /^[HSP]\d[A-Z]{2}\d{5}$/;
const HEX = /^[a-f0-9]{64}$/;
const FIRESTORE_MIN_SECONDS = -62_135_596_800;
const FIRESTORE_MAX_SECONDS = 253_402_300_799;

function fail(code: string): never { throw new Error(`BR7A_${code}`); }
function expect(condition: unknown, code: string): asserts condition { if (!condition) fail(code); }
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  return fail('UNSUPPORTED_CANONICAL_VALUE');
}

export const semanticDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const byteDigest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value: unknown, keys: readonly string[], at: string): asserts value is Json {
  expect(isRecord(value), `${at}_NOT_OBJECT`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  expect(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${at}_KEY_SET_MISMATCH`);
}

function fileIdentity(path: string) {
  const handle = openSync(path, 'r'); const buffer = Buffer.allocUnsafe(64 * 1024); const hash = createHash('sha256');
  try {
    for (;;) { const bytes = readSync(handle, buffer, 0, buffer.length, null); if (bytes === 0) break; hash.update(buffer.subarray(0, bytes)); }
  } finally { closeSync(handle); }
  return { bytes: statSync(path).size, sha256: hash.digest('hex') };
}

function strictFirestoreJson(value: unknown, at: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { expect(Number.isFinite(value), 'UNSAFE_NONFINITE_NUMBER'); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => strictFirestoreJson(item, `${at}/${index}`)); return; }
  expect(isRecord(value) && Object.getPrototypeOf(value) === Object.prototype, 'UNSAFE_FIRESTORE_VALUE');
  if ('__firestoreType' in value) {
    exactKeys(value, ['__firestoreType', 'seconds', 'nanoseconds'], 'TIMESTAMP');
    expect(value.__firestoreType === 'timestamp/v1' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds), 'UNSAFE_TIMESTAMP_TYPE');
    expect(value.seconds >= FIRESTORE_MIN_SECONDS && value.seconds <= FIRESTORE_MAX_SECONDS, 'UNSAFE_TIMESTAMP_SECONDS');
    expect(value.nanoseconds >= 0 && value.nanoseconds < 1_000_000_000 && value.nanoseconds % 1_000 === 0, 'UNSAFE_TIMESTAMP_NANOSECONDS');
    return;
  }
  expect(!('seconds' in value && 'nanoseconds' in value), 'TIMESTAMP_LOOKALIKE');
  for (const [key, child] of Object.entries(value)) strictFirestoreJson(child, `${at}/${pointerToken(key)}`);
}

const pointerToken = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const pointerUntoken = (value: string) => value.replace(/~1/g, '/').replace(/~0/g, '~');
const candidateArray = (value: unknown) => isRecord(value) && Array.isArray(value.candidates) ? value.candidates : [];
const candidateId = (value: unknown) => isRecord(value) ? text(value.id) || text(value.candidateId) : '';
const candidateFec = (value: unknown) => isRecord(value) && isRecord(value.externalIds) ? text(value.externalIds.fecCandidateId) : '';

function getPointer(value: unknown, pointer: string): unknown {
  if (pointer === '/' || pointer === '') return value;
  let current = value;
  for (const raw of pointer.split('/').slice(1)) {
    const key = pointerUntoken(raw);
    if (key.startsWith('@fec-sha256:') || key.startsWith('@id-sha256:')) {
      if (!Array.isArray(current)) return undefined;
      const fecMode = key.startsWith('@fec-sha256:'); const wanted = key.slice(fecMode ? '@fec-sha256:'.length : '@id-sha256:'.length);
      const matches = current.filter((item) => semanticDigest(fecMode ? candidateFec(item) : candidateId(item)) === wanted);
      if (matches.length !== 1) return undefined; current = matches[0]; continue;
    }
    if (Array.isArray(current)) { if (!/^\d+$/.test(key)) return undefined; current = current[Number(key)]; }
    else if (isRecord(current)) current = current[key]; else return undefined;
  }
  return current;
}

function setPointer(target: Json, pointer: string, value: unknown) {
  const keys = pointer.split('/').slice(1).map(pointerUntoken); let current: unknown = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (key.startsWith('@fec-sha256:') || key.startsWith('@id-sha256:')) {
      expect(Array.isArray(current), 'INVALID_IDENTITY_MERGE_POINTER'); const fecMode = key.startsWith('@fec-sha256:');
      const matches = current.filter((item) => semanticDigest(fecMode ? candidateFec(item) : candidateId(item)) === key.slice(fecMode ? 12 : 11));
      expect(matches.length === 1, 'NONUNIQUE_IDENTITY_MERGE_POINTER'); current = matches[0]; continue;
    }
    if (Array.isArray(current)) {
      expect(/^\d+$/.test(key), 'INVALID_ARRAY_POINTER'); const position = Number(key);
      if (current[position] === undefined) current[position] = /^\d+$/.test(keys[index + 1]) ? [] : {}; current = current[position];
    } else {
      expect(isRecord(current), 'INVALID_OBJECT_POINTER'); if (!(key in current)) current[key] = /^\d+$/.test(keys[index + 1]) ? [] : {}; current = current[key];
    }
  }
  const last = keys.at(-1); expect(last !== undefined && !last.startsWith('@'), 'INVALID_MERGE_TARGET');
  if (Array.isArray(current)) current[Number(last)] = structuredClone(value); else { expect(isRecord(current), 'INVALID_MERGE_PARENT'); current[last] = structuredClone(value); }
}

type Inputs = ReturnType<typeof loadG8V2ExecutorReadinessInputs>;

export function loadG8V2ExecutorReadinessInputs(paths = G8_BR7A_PATHS) {
  const identities = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, fileIdentity(path)])) as Record<keyof typeof paths, { bytes: number; sha256: string }>;
  const parse = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return {
    identities,
    plan: parse(paths.plan), snapshot: parse(paths.snapshot), bundle: parse(paths.bundle), br6bPlan: parse(paths.br6bPlan),
    publication: parse(paths.publication), finance: parse(paths.finance), overrides: parse(paths.overrides),
    g2StatusText: readFileSync(paths.g2Status, 'utf8'),
  };
}

function validateIdentities(inputs: Inputs) {
  for (const [name, expected] of Object.entries(EXPECTED_IDENTITIES)) expect(same(inputs.identities[name as keyof typeof EXPECTED_IDENTITIES], expected), `INPUT_IDENTITY_DRIFT_${name.toUpperCase()}`);
}

function validatePlanShape(plan: unknown) {
  exactKeys(plan, ['schemaVersion','contract','pointerContract','basePlan','certifiedOverrides','identityResolution','entries','aggregate','readiness','safety','digests'], 'PLAN');
  expect(plan.schemaVersion === 1 && plan.contract === 'g8-4br6c-final-candidate-identity-resolution-plan/v1' && plan.pointerContract === 'g8-4br6c-override-resolved-pointer-rules/v1', 'PLAN_CONTRACT_MISMATCH');
  exactKeys(plan.basePlan, ['contract','planDigest','privatePlanSha256'], 'BASE_PLAN');
  exactKeys(plan.certifiedOverrides, ['path','bytes','sha256','g2StatusSha256','mappingDigest'], 'CERTIFIED_OVERRIDES');
  exactKeys(plan.identityResolution, ['schemaVersion','contract','policy','resolutions','aggregate','digests'], 'IDENTITY_RESOLUTION');
  exactKeys(plan.identityResolution.policy, ['exactLegacyTupleRequired','officialFecUrlAndIdRequired','canonicalRaceSeatCandidateAndSourceEvidenceRequired','certifiedCurrentBundleAuthoritative','approvedManyToOneGroupRequired','completeAliasRollbackEvidenceRequired','diagnosticFieldsCannotEstablishIdentity'], 'IDENTITY_POLICY');
  exactKeys(plan.identityResolution.aggregate, ['resolvedRaces','correctedOneToOneRaces','consumedOverrides','correctedOneToOneOverrides','approvedManyToOneMergeGroups','approvedManyToOneAliases','resolvedIdentityBlockers','remainingConflicts'], 'IDENTITY_AGGREGATE');
  exactKeys(plan.identityResolution.digests, ['overrides','resolutions','rollbackAliases','policy'], 'IDENTITY_DIGESTS');
  expect(Array.isArray(plan.identityResolution.resolutions), 'RESOLUTIONS_NOT_ARRAY');
  for (const resolution of plan.identityResolution.resolutions) {
    exactKeys(resolution, ['racePathDigest','resolutionKind','sourceAliases','canonicalCandidates','resolvedIdentityBlockers','consumedOverrideDigests','targetFecIdDigests','mergeGroups','rollbackAliases','sourceEvidenceDigests','resolutionDigest'], 'RESOLUTION');
    expect(Array.isArray(resolution.mergeGroups) && Array.isArray(resolution.rollbackAliases), 'RESOLUTION_ARRAY_MISSING');
    resolution.mergeGroups.forEach((item: unknown) => exactKeys(item, ['mergeGroupDigest','sourceAliases','canonicalCandidates'], 'MERGE_GROUP'));
    resolution.rollbackAliases.forEach((item: unknown) => exactKeys(item, ['legacyCandidateIdDigest','actualCandidateDigest'], 'ROLLBACK_ALIAS'));
  }
  expect(Array.isArray(plan.entries), 'PLAN_ENTRIES_NOT_ARRAY');
  for (const entry of plan.entries) {
    exactKeys(entry, ['path','family','disposition','safeToReplace','pointerSignature','pointerRules','evidenceDigests','proposedOutputDigest','proposedOutputBasis','rollbackDigest','rollbackEvidence','rationale'], 'ENTRY');
    expect(Array.isArray(entry.pointerRules) && Array.isArray(entry.evidenceDigests), 'ENTRY_ARRAY_MISSING');
    for (const rule of entry.pointerRules) {
      const required = ['pointer','kind','actualValueDigest','expectedValueDigest','provenanceClass','blockerClass','evidenceDigests','rationale'];
      const optional = ['identityDigest','identitySide']; const keys = Object.keys(rule);
      expect(required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key)), 'POINTER_RULE_KEY_SET_MISMATCH');
      expect(Array.isArray(rule.evidenceDigests), 'RULE_EVIDENCE_NOT_ARRAY');
    }
  }
  exactKeys(plan.aggregate, ['plannedPaths','duplicatePaths','omittedPaths','byFamily','byDisposition','byProvenanceClass','byDifferenceKind','byPointerSignature','byBlockerClass','pointerRules'], 'PLAN_AGGREGATE');
  exactKeys(plan.readiness, ['readyForExecutor','deterministicallyResolved','unresolved','reproducibleOutputs','rollbackEvidenceComplete','policyConflicts','remainingIdentityConflicts'], 'PLAN_READINESS');
  exactKeys(plan.safety, ['firebaseImported','credentialsLoaded','networkRequests','productionOperations','dispositionsExecuted'], 'PLAN_SAFETY');
  exactKeys(plan.digests, ['entries','aggregate','outputs','rollback','plan'], 'PLAN_DIGESTS');
}

function validateSourceShapes(inputs: Inputs) {
  const { snapshot, bundle, overrides, publication, finance, br6bPlan } = inputs as any;
  exactKeys(snapshot, ['schemaVersion','contract','capture','selector','inventory','conflicts','counts','assessments','summaries','unknown','resolutionPlan','digests','readAccounting','writeAccounting'], 'SNAPSHOT');
  expect(snapshot.schemaVersion === 1 && snapshot.contract === 'g8-4br5a-conflict-snapshot/v1' && Array.isArray(snapshot.conflicts), 'SNAPSHOT_CONTRACT_MISMATCH');
  snapshot.conflicts.forEach((item: unknown) => exactKeys(item, ['path','family','actual','actualDigest','expected','expectedDigest','differences','productionOnlyPointers'], 'CONFLICT'));
  exactKeys(bundle, ['schemaVersion','certifiedAt','generation','sourceDigests','counts','readiness','audit','documents','inputDigest','evidenceDigest','planDigest','bundleDigest'], 'BUNDLE');
  expect(bundle.schemaVersion === 1 && bundle.generation === 'canonical-2026-shadow-v2' && bundle.bundleDigest === BUNDLE_DIGEST && Array.isArray(bundle.documents), 'BUNDLE_CONTRACT_MISMATCH');
  bundle.documents.forEach((item: unknown) => exactKeys(item, ['path','data'], 'BUNDLE_DOCUMENT'));
  exactKeys(overrides, ['schemaVersion','contestDispositions','candidateOverrides'], 'OVERRIDES');
  expect(overrides.schemaVersion === 1 && Array.isArray(overrides.candidateOverrides) && overrides.candidateOverrides.length === 8, 'OVERRIDE_CONTRACT_MISMATCH');
  for (const item of overrides.candidateOverrides) {
    const keys = Object.keys(item); const required = ['legacyRaceId','legacyCandidateId','fecCandidateId','sourceUrl'];
    expect(required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || key === 'approvedManyToOneMerge'), 'OVERRIDE_KEY_SET_MISMATCH');
  }
  exactKeys(publication, ['schemaVersion','capturedAt','projectId','databaseId','collectionCounts','inputs','inputDigest'], 'PUBLICATION');
  expect(publication.schemaVersion === 3 && publication.inputDigest === PUBLICATION_INPUT_DIGEST, 'PUBLICATION_IDENTITY_MISMATCH');
  exactKeys(finance, ['schemaVersion','sourceUrl','archiveDigest','capture','candidateFacts','matchedCandidates','unavailableCandidates','provenance','inputDigest'], 'FINANCE');
  expect(finance.schemaVersion === 1 && finance.inputDigest === FINANCE_INPUT_DIGEST && Array.isArray(finance.candidateFacts) && Array.isArray(finance.capture?.records), 'FINANCE_IDENTITY_MISMATCH');
  exactKeys(br6bPlan, ['schemaVersion','contract','pointerContract','basePlan','equivalence','entries','aggregate','readiness','safety','digests'], 'BR6B_PLAN');
  expect(br6bPlan.schemaVersion === 1 && br6bPlan.contract === 'g8-4br6b-revised-disposition-plan/v1' && Array.isArray(br6bPlan.entries), 'BR6B_CONTRACT_MISMATCH');
}

function validateBr6bDigests(plan: Json) {
  const equivalence = plan.equivalence;
  exactKeys(equivalence, ['schemaVersion','contract','lineageCatalogDigest','policy','pairs','races','aggregate','safety','digests'], 'BR6B_EQUIVALENCE');
  exactKeys(equivalence.digests, ['pairs','races','evidence'], 'BR6B_EQUIVALENCE_DIGESTS');
  expect(Array.isArray(equivalence.pairs) && Array.isArray(equivalence.races), 'BR6B_EQUIVALENCE_ARRAY_MISSING');
  for (const pair of equivalence.pairs) {
    exactKeys(pair, ['racePathDigest','fecCandidateIdDigest','status','rejectClasses','actualMultiplicity','certifiedMultiplicity','actualCandidateIdDigest','certifiedCandidateIdDigest','checks','evidenceDigests','pairDigest'], 'BR6B_PAIR');
    exactKeys(pair.checks, ['fecFormat','uniqueOnActualSide','uniqueOnCertifiedSide','notReusedAcrossRaces','office','state','districtSeat','cycle','canonicalContest','certifiedCurrentCandidate','officialFecBaseline','financeEvidence'], 'BR6B_PAIR_CHECKS');
    const base = { ...pair }; delete base.pairDigest; expect(pair.pairDigest === semanticDigest(base), 'BR6B_PAIR_DIGEST_MISMATCH');
  }
  equivalence.races.forEach((race: unknown) => exactKeys(race, ['racePathDigest','acceptedPairs','rejectedPairs','fullyResolved','actualCandidates','certifiedCandidates','rejectClasses','pairEvidenceDigest'], 'BR6B_RACE'));
  const pairsDigest = semanticDigest(equivalence.pairs); const racesDigest = semanticDigest(equivalence.races);
  expect(equivalence.digests.pairs === pairsDigest && equivalence.digests.races === racesDigest, 'BR6B_EQUIVALENCE_COMPONENT_DIGEST_MISMATCH');
  const evidenceBase = { ...equivalence, digests: { pairs: pairsDigest, races: racesDigest } };
  expect(equivalence.digests.evidence === semanticDigest(evidenceBase), 'BR6B_EQUIVALENCE_DIGEST_MISMATCH');
  const entries = semanticDigest(plan.entries); const aggregate = semanticDigest({ aggregate: plan.aggregate, readiness: plan.readiness, equivalence: equivalence.digests });
  expect(plan.digests.entries === entries && plan.digests.aggregate === aggregate, 'BR6B_COMPONENT_DIGEST_MISMATCH');
  const base = { ...plan, digests: { entries, aggregate } };
  expect(plan.digests.plan === BR6B_PLAN_DIGEST && plan.digests.plan === semanticDigest(base), 'BR6B_PLAN_DIGEST_MISMATCH');
}

type Difference = { pointer: string; kind: string; actualValueDigest: string | null; expectedValueDigest: string | null; identityDigest?: string; identitySide?: string };

function candidateIndex(value: unknown) {
  const ids: string[] = []; const values = new Map<string, unknown[]>(); const invalid: unknown[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const fec = candidateFec(item); if (!FEC_ID.test(fec)) { invalid.push(item); continue; }
    ids.push(fec); values.set(fec, [...(values.get(fec) ?? []), item]);
  }
  return { ids, values, invalid };
}

function deriveDifferences(actual: unknown, expected: unknown, pointer: string, accepted: Set<string>): Difference[] {
  if (actual !== undefined && expected !== undefined && semanticDigest(actual) === semanticDigest(expected)) return [];
  if ((Array.isArray(actual) || Array.isArray(expected)) && /(?:^|\/)candidates$/.test(pointer)) {
    const left = candidateIndex(actual); const right = candidateIndex(expected); const differences: Difference[] = [];
    const ids = sortedUnique([...left.values.keys(), ...right.values.keys()]);
    const fullyAccepted = left.invalid.length === 0 && right.invalid.length === 0 && left.ids.length === right.ids.length
      && ids.filter((id) => accepted.has(semanticDigest(id))).length === left.ids.length
      && left.ids.every((id) => left.values.get(id)?.length === 1) && right.ids.every((id) => right.values.get(id)?.length === 1);
    if (fullyAccepted && left.ids.some((id, index) => id !== right.ids[index])) differences.push({ pointer: pointer || '/', kind: 'reorder', actualValueDigest: semanticDigest(left.ids.map(semanticDigest)), expectedValueDigest: semanticDigest(right.ids.map(semanticDigest)) });
    for (const fec of ids) {
      const l = left.values.get(fec) ?? []; const r = right.values.get(fec) ?? []; const fecDigest = semanticDigest(fec); const durable = `${pointer}/${pointerToken(`@fec-sha256:${fecDigest}`)}`;
      if (accepted.has(fecDigest) && l.length === 1 && r.length === 1) differences.push(...deriveDifferences(l[0], r[0], durable, accepted));
      else differences.push({ pointer: durable, kind: 'identity', actualValueDigest: l.length === 1 ? semanticDigest(l[0]) : l.length === 0 ? null : semanticDigest(l), expectedValueDigest: r.length === 1 ? semanticDigest(r[0]) : r.length === 0 ? null : semanticDigest(r), identityDigest: fecDigest, identitySide: l.length === 0 ? 'expected-only' : r.length === 0 ? 'production-only' : 'invalid-or-duplicate' });
    }
    for (const [side, invalid] of [['actual', left.invalid], ['expected', right.invalid]] as const) for (const item of invalid) differences.push({ pointer: `${pointer}/${pointerToken(`@invalid-sha256:${semanticDigest(item)}`)}`, kind: 'identity', actualValueDigest: side === 'actual' ? semanticDigest(item) : null, expectedValueDigest: side === 'expected' ? semanticDigest(item) : null, identityDigest: semanticDigest(item), identitySide: 'invalid-or-duplicate' });
    return differences;
  }
  if (isRecord(actual) && isRecord(expected)) return sortedUnique([...Object.keys(actual), ...Object.keys(expected)]).flatMap((key) => deriveDifferences(actual[key], expected[key], `${pointer}/${pointerToken(key)}`, accepted));
  if (Array.isArray(actual) && Array.isArray(expected)) return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) => deriveDifferences(actual[index], expected[index], `${pointer}/${index}`, accepted)).flat();
  if (isRecord(actual) && expected === undefined) return Object.keys(actual).sort().flatMap((key) => deriveDifferences(actual[key], undefined, `${pointer}/${pointerToken(key)}`, accepted));
  if (isRecord(expected) && actual === undefined) return Object.keys(expected).sort().flatMap((key) => deriveDifferences(undefined, expected[key], `${pointer}/${pointerToken(key)}`, accepted));
  if (Array.isArray(actual) && expected === undefined) return actual.flatMap((item, index) => deriveDifferences(item, undefined, `${pointer}/${index}`, accepted));
  if (Array.isArray(expected) && actual === undefined) return expected.flatMap((item, index) => deriveDifferences(undefined, item, `${pointer}/${index}`, accepted));
  return [{ pointer: pointer || '/', kind: actual === undefined ? 'expected-only' : expected === undefined ? 'production-only' : 'value', actualValueDigest: actual === undefined ? null : semanticDigest(actual), expectedValueDigest: expected === undefined ? null : semanticDigest(expected) }];
}

function idCandidateIndex(value: unknown) {
  const ids: string[] = []; const values = new Map<string, Json>();
  if (!Array.isArray(value)) return null;
  for (const item of value) { const identity = candidateId(item); if (!identity || values.has(identity) || !isRecord(item)) return null; ids.push(identity); values.set(identity, item); }
  return { ids, values };
}

function deriveIdDifferences(actual: unknown, expected: unknown, pointer = ''): Difference[] {
  if (actual !== undefined && expected !== undefined && semanticDigest(actual) === semanticDigest(expected)) return [];
  if ((Array.isArray(actual) || Array.isArray(expected)) && /(?:^|\/)candidates$/.test(pointer)) {
    const left = actual === undefined ? { ids: [] as string[], values: new Map<string, Json>() } : idCandidateIndex(actual);
    const right = expected === undefined ? { ids: [] as string[], values: new Map<string, Json>() } : idCandidateIndex(expected);
    if (!left || !right) return [{ pointer: pointer || '/', kind: 'identity', actualValueDigest: actual === undefined ? null : semanticDigest(actual), expectedValueDigest: expected === undefined ? null : semanticDigest(expected), identityDigest: semanticDigest({ actual: left?.ids ?? null, expected: right?.ids ?? null }), identitySide: 'invalid-or-duplicate' }];
    const differences: Difference[] = []; const leftSet = new Set(left.ids); const rightSet = new Set(right.ids);
    if (left.ids.length === right.ids.length && left.ids.every((id) => rightSet.has(id)) && left.ids.some((id, index) => id !== right.ids[index])) differences.push({ pointer: pointer || '/', kind: 'reorder', actualValueDigest: semanticDigest(left.ids), expectedValueDigest: semanticDigest(right.ids) });
    for (const id of left.ids.filter((item) => !rightSet.has(item)).sort()) differences.push({ pointer: `${pointer}/${pointerToken(`@id-sha256:${semanticDigest(id)}`)}`, kind: 'identity', actualValueDigest: semanticDigest(left.values.get(id)), expectedValueDigest: null, identityDigest: semanticDigest(id), identitySide: 'production-only' });
    for (const id of right.ids.filter((item) => !leftSet.has(item)).sort()) differences.push({ pointer: `${pointer}/${pointerToken(`@id-sha256:${semanticDigest(id)}`)}`, kind: actual === undefined ? 'expected-only' : 'identity', actualValueDigest: null, expectedValueDigest: semanticDigest(right.values.get(id)), identityDigest: semanticDigest(id), ...(actual === undefined ? {} : { identitySide: 'expected-only' }) });
    for (const id of left.ids.filter((item) => rightSet.has(item)).sort()) differences.push(...deriveIdDifferences(left.values.get(id), right.values.get(id), `${pointer}/${pointerToken(`@id-sha256:${semanticDigest(id)}`)}`));
    return differences;
  }
  if (isRecord(actual) && isRecord(expected)) return sortedUnique([...Object.keys(actual), ...Object.keys(expected)]).flatMap((key) => deriveIdDifferences(actual[key], expected[key], `${pointer}/${pointerToken(key)}`));
  if (Array.isArray(actual) && Array.isArray(expected)) return Array.from({ length: Math.max(actual.length, expected.length) }, (_, index) => deriveIdDifferences(actual[index], expected[index], `${pointer}/${index}`)).flat();
  if (isRecord(actual) && expected === undefined) return Object.keys(actual).sort().flatMap((key) => deriveIdDifferences(actual[key], undefined, `${pointer}/${pointerToken(key)}`));
  if (isRecord(expected) && actual === undefined) return Object.keys(expected).sort().flatMap((key) => deriveIdDifferences(undefined, expected[key], `${pointer}/${pointerToken(key)}`));
  if (Array.isArray(actual) && expected === undefined) return actual.flatMap((item, index) => deriveIdDifferences(item, undefined, `${pointer}/${index}`));
  if (Array.isArray(expected) && actual === undefined) return expected.flatMap((item, index) => deriveIdDifferences(undefined, item, `${pointer}/${index}`));
  return [{ pointer: pointer || '/', kind: actual === undefined ? 'expected-only' : expected === undefined ? 'production-only' : 'value', actualValueDigest: actual === undefined ? null : semanticDigest(actual), expectedValueDigest: expected === undefined ? null : semanticDigest(expected) }];
}

function officialResearchIdentity(bundleDocs: Map<string, Json>, racePath: string, fec: string) {
  const research = bundleDocs.get(`${racePath}/candidateResearch/fec-${fec}`); const baseline = research?.baselineResearch; const identity = baseline?.fields?.identity;
  return identity?.availability === 'present' && identity?.verificationLevel === 'official' && identity?.sourceId === `fec-${fec}`
    && identity?.sourceUrl === `https://www.fec.gov/data/candidate/${fec}/` && identity?.sourceVintage === 'canonical-publication-schema-v3'
    && identity?.value?.fecCandidateId === fec && typeof identity?.asOf === 'string' && identity.asOf.startsWith('2026-');
}

function validateFecEquivalence(inputs: Inputs, conflicts: Json[], bundleDocs: Map<string, Json>) {
  const br6b = inputs.br6bPlan as Json; const finance = inputs.finance as Json;
  const pairsByKey = new Map<string, Json>(br6b.equivalence.pairs.map((pair: Json) => [`${pair.racePathDigest}/${pair.fecCandidateIdDigest}`, pair]));
  const racesByDigest = new Map<string, Json>(br6b.equivalence.races.map((race: Json) => [race.racePathDigest, race]));
  const facts = new Map<string, Json>(finance.candidateFacts.map((fact: Json) => [`${fact.raceId}/${fact.fecCandidateId}`, fact]));
  const records = new Map<string, Json>(finance.capture.records.map((record: Json) => [`${record.raceId}/${record.fecCandidateId}`, record]));
  const memberships = new Map<string, Set<string>>(); let acceptedPairs = 0; let financeMatched = 0; let financeNotPresent = 0; let fullyResolved = 0;
  const acceptedByPath = new Map<string, Set<string>>();
  for (const conflict of conflicts.filter((item) => item.family === 'races')) {
    const raceId = conflict.path.slice(6); const race = conflict.expected; const actual = candidateIndex(conflict.actual.candidates); const expected = candidateIndex(conflict.expected.candidates);
    for (const fec of [...actual.values.keys(), ...expected.values.keys()]) { const paths = memberships.get(fec) ?? new Set<string>(); paths.add(conflict.path); memberships.set(fec, paths); }
    const accepted = new Set<string>();
    for (const fec of sortedUnique([...actual.values.keys(), ...expected.values.keys()])) {
      const left = actual.values.get(fec) ?? []; const right = expected.values.get(fec) ?? []; const pair: Json | undefined = pairsByKey.get(`${semanticDigest(conflict.path)}/${semanticDigest(fec)}`);
      expect(pair !== undefined, 'FEC_PAIR_EVIDENCE_MISSING');
      const fact = facts.get(`${raceId}/${fec}`) as Json | undefined; const record = records.get(`${raceId}/${fec}`) as Json | undefined;
      const canonical = right.length === 1 && candidateId(right[0]) === `fec-${fec}` && officialResearchIdentity(bundleDocs, conflict.path, fec)
        && race.id === raceId && race.electionYear === 2026 && ((fec[0] === 'H' && race.office === 'House') || (fec[0] === 'S' && race.office === 'Senate')) && fec.slice(2, 4) === race.state;
      const financeOk = fact === undefined && record === undefined ? 'not-present' : fact?.raceId === raceId && fact?.candidateId === `fec-${fec}` && fact?.office === race.office && fact?.state === race.state && fact?.district === race.district && record?.raceId === raceId && record?.candidateId === `fec-${fec}` && record?.cycle === 2026 ? 'matched' : 'contradictory';
      const isAccepted = left.length === 1 && right.length === 1 && canonical && financeOk !== 'contradictory';
      if (isAccepted) {
        expect(pair.status === 'accepted' && pair.rejectClasses.length === 0 && pair.actualMultiplicity === 1 && pair.certifiedMultiplicity === 1, 'FEC_ACCEPTED_PAIR_MISMATCH');
        expect(pair.actualCandidateIdDigest === semanticDigest(candidateId(left[0])) && pair.certifiedCandidateIdDigest === semanticDigest(`fec-${fec}`), 'FEC_PAIR_IDENTITY_MISMATCH');
        expect(Object.entries(pair.checks).every(([key, value]) => key === 'financeEvidence' ? value === financeOk : value === true), 'FEC_PAIR_CHECK_MISMATCH');
        accepted.add(semanticDigest(fec)); acceptedPairs += 1; if (financeOk === 'matched') financeMatched += 1; else financeNotPresent += 1;
      } else expect(pair.status === 'rejected', 'FEC_REJECTED_PAIR_MISMATCH');
    }
    const raceEvidence = racesByDigest.get(semanticDigest(conflict.path)) as Json | undefined; expect(raceEvidence !== undefined, 'FEC_RACE_EVIDENCE_MISSING');
    if (!EXCEPTION_RACES.has(raceId)) {
      expect(actual.invalid.length === 0 && expected.invalid.length === 0 && actual.ids.length === expected.ids.length && accepted.size === actual.ids.length, 'FEC_EQUIVALENCE_NOT_UNIQUE');
      expect(raceEvidence.fullyResolved === true && raceEvidence.acceptedPairs === actual.ids.length && raceEvidence.rejectedPairs === 0, 'FEC_RACE_RESOLUTION_MISMATCH'); fullyResolved += 1;
    }
    acceptedByPath.set(conflict.path, accepted);
  }
  expect([...memberships.values()].every((paths) => paths.size === 1), 'FEC_CROSS_RACE_REUSE');
  expect(fullyResolved === 425 && acceptedPairs === 2_097 && financeMatched === 2_087 && financeNotPresent === 10, 'FEC_AGGREGATE_MISMATCH');
  expect(br6b.equivalence.aggregate.fullyResolvedRaces === 425 && br6b.equivalence.aggregate.acceptedFecPairs === 2_097 && br6b.equivalence.aggregate.rejectedFecPairs === 7, 'BR6B_FEC_AGGREGATE_MISMATCH');
  return acceptedByPath;
}

function validateOverrides(inputs: Inputs, conflictsByPath: Map<string, Json>, bundleDocs: Map<string, Json>) {
  const plan = inputs.plan as Json; const overrides = inputs.overrides as Json; const br6b = inputs.br6bPlan as Json;
  expect(inputs.g2StatusText.includes(OVERRIDE_MAPPING_DIGEST) && inputs.g2StatusText.includes('data/2026/canonical-identity-overrides.json'), 'G2_STATUS_CONTRACT_MISMATCH');
  expect(plan.certifiedOverrides.path === 'data/2026/canonical-identity-overrides.json' && plan.certifiedOverrides.mappingDigest === OVERRIDE_MAPPING_DIGEST, 'CERTIFIED_OVERRIDE_BINDING_MISMATCH');
  const byRace = new Map<string, Json[]>();
  for (const override of overrides.candidateOverrides) {
    expect(EXCEPTION_RACES.has(override.legacyRaceId) && FEC_ID.test(override.fecCandidateId), 'OVERRIDE_RACE_OR_FEC_INVALID');
    expect(override.sourceUrl === `https://www.fec.gov/data/candidate/${override.fecCandidateId}/`, 'OVERRIDE_SOURCE_NOT_EXACT_FEC');
    byRace.set(override.legacyRaceId, [...(byRace.get(override.legacyRaceId) ?? []), override]);
  }
  expect(byRace.size === 4 && [...byRace.values()].reduce((sum, items) => sum + items.length, 0) === 8, 'OVERRIDE_COVERAGE_MISMATCH');
  const resolutions: Json[] = []; let mergeGroups = 0; let mergeAliases = 0; let oneToOne = 0;
  for (const raceId of [...byRace.keys()].sort()) {
    const path = `races/${raceId}`; const conflict = conflictsByPath.get(path); expect(conflict !== undefined, 'OVERRIDE_CONFLICT_MISSING');
    const raceOverrides = byRace.get(raceId)!; const expectedCandidates = candidateArray(conflict.expected); const actualCandidates = candidateArray(conflict.actual);
    const targetMap = new Map<string, Json[]>();
    for (const override of raceOverrides) {
      targetMap.set(override.fecCandidateId, [...(targetMap.get(override.fecCandidateId) ?? []), override]);
      expect(actualCandidates.filter((candidate) => candidateId(candidate) === override.legacyCandidateId).length === 1, 'OVERRIDE_LEGACY_TUPLE_NOT_UNIQUE');
      expect(expectedCandidates.filter((candidate) => candidateFec(candidate) === override.fecCandidateId && candidateId(candidate) === `fec-${override.fecCandidateId}`).length === 1, 'OVERRIDE_CANONICAL_TARGET_NOT_UNIQUE');
      expect(officialResearchIdentity(bundleDocs, path, override.fecCandidateId), 'OVERRIDE_OFFICIAL_FEC_BASELINE_MISSING');
    }
    const resolutionKind = [...targetMap.values()].some((items) => items.length > 1) ? 'approved-many-to-one' : 'corrected-one-to-one';
    const groups: Json[] = []; const rollbackAliases: Json[] = []; const sourceEvidence: string[] = [];
    for (const [fec, items] of [...targetMap].sort(([left], [right]) => left.localeCompare(right))) {
      const rejected = br6b.equivalence.pairs.find((pair: Json) => pair.racePathDigest === semanticDigest(path) && pair.fecCandidateIdDigest === semanticDigest(fec));
      expect(rejected?.status === 'rejected' && rejected.rejectClasses.every((reason: string) => ['duplicate-actual-fec-id','missing-actual-candidate'].includes(reason)), 'OVERRIDE_REJECTED_SOURCE_EVIDENCE_INVALID');
      sourceEvidence.push(rejected.pairDigest, ...rejected.evidenceDigests);
      if (items.length > 1) {
        const names = sortedUnique(items.map((item) => text(item.approvedManyToOneMerge))); expect(names.length === 1 && names[0].length > 0 && raceId === '2026-NJ-house-008', 'UNAPPROVED_MANY_TO_ONE');
        groups.push({ mergeGroupDigest: semanticDigest(names[0]), sourceAliases: items.length, canonicalCandidates: 1 }); mergeGroups += 1; mergeAliases += items.length;
      } else expect(items[0].approvedManyToOneMerge === undefined, 'SPURIOUS_MANY_TO_ONE');
      for (const override of items) {
        const actual = actualCandidates.find((candidate) => candidateId(candidate) === override.legacyCandidateId);
        rollbackAliases.push({ legacyCandidateIdDigest: semanticDigest(override.legacyCandidateId), actualCandidateDigest: semanticDigest(actual) });
      }
    }
    rollbackAliases.sort((left, right) => left.legacyCandidateIdDigest.localeCompare(right.legacyCandidateIdDigest)); groups.sort((left, right) => left.mergeGroupDigest.localeCompare(right.mergeGroupDigest));
    const base = { racePathDigest: semanticDigest(path), resolutionKind, sourceAliases: raceOverrides.length, canonicalCandidates: targetMap.size, resolvedIdentityBlockers: targetMap.size,
      consumedOverrideDigests: raceOverrides.map(semanticDigest).sort(), targetFecIdDigests: [...targetMap.keys()].map(semanticDigest).sort(), mergeGroups: groups, rollbackAliases, sourceEvidenceDigests: sortedUnique(sourceEvidence) };
    const expectedResolution = { ...base, resolutionDigest: semanticDigest(base) };
    const actualResolution = plan.identityResolution.resolutions.find((item: Json) => item.racePathDigest === base.racePathDigest);
    expect(same(actualResolution, expectedResolution), 'IDENTITY_RESOLUTION_MISMATCH'); resolutions.push(expectedResolution); if (resolutionKind === 'corrected-one-to-one') oneToOne += 1;
  }
  resolutions.sort((left, right) => left.racePathDigest.localeCompare(right.racePathDigest));
  const normalizedOverrides = [...overrides.candidateOverrides].sort((left, right) => `${left.legacyRaceId}/${left.legacyCandidateId}`.localeCompare(`${right.legacyRaceId}/${right.legacyCandidateId}`));
  const aliases = resolutions.flatMap((item) => item.rollbackAliases); const digestBase = { overrides: semanticDigest(normalizedOverrides), resolutions: semanticDigest(resolutions), rollbackAliases: semanticDigest(aliases) };
  const policyBase = { schemaVersion: 1, contract: 'g8-4br6c-certified-override-resolution/v1', policy: plan.identityResolution.policy, resolutions, aggregate: plan.identityResolution.aggregate };
  expect(plan.identityResolution.digests.overrides === digestBase.overrides && plan.identityResolution.digests.resolutions === digestBase.resolutions && plan.identityResolution.digests.rollbackAliases === digestBase.rollbackAliases, 'IDENTITY_COMPONENT_DIGEST_MISMATCH');
  expect(plan.identityResolution.digests.policy === semanticDigest({ ...policyBase, digests: digestBase }), 'IDENTITY_POLICY_DIGEST_MISMATCH');
  expect(oneToOne === 3 && mergeGroups === 1 && mergeAliases === 2 && same(plan.identityResolution.aggregate, { resolvedRaces: 4, correctedOneToOneRaces: 3, consumedOverrides: 8, correctedOneToOneOverrides: 6, approvedManyToOneMergeGroups: 1, approvedManyToOneAliases: 2, resolvedIdentityBlockers: 7, remainingConflicts: 0 }), 'IDENTITY_AGGREGATE_MISMATCH');
}

function aggregateEntries(entries: Json[]) {
  const rules = entries.flatMap((entry) => entry.pointerRules); const count = (items: any[], key: (item: any) => string) => Object.fromEntries([...items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right)));
  const complete = (keys: string[], values: Json) => Object.fromEntries(keys.map((key) => [key, values[key] ?? 0]));
  return { plannedPaths: entries.length, duplicatePaths: entries.length - new Set(entries.map((entry) => entry.path)).size, omittedPaths: 858 - new Set(entries.map((entry) => entry.path)).size,
    byFamily: complete(['races','measures','candidateResearch','measureResearch','metrics'], count(entries, (entry) => entry.family)),
    byDisposition: complete(['preserve-current','replace-with-certified','deterministic-merge','unresolved'], count(entries, (entry) => entry.disposition)),
    byProvenanceClass: complete(['current-certified-authoritative','existing-value-with-validated-source','runtime-metadata','identity-conflict','unsupported-production-only-value','ambiguous/unresolved'], count(rules, (rule) => rule.provenanceClass)),
    byDifferenceKind: complete(['reorder','identity','value','expected-only','production-only'], count(rules, (rule) => rule.kind)),
    byPointerSignature: count(entries, (entry) => entry.pointerSignature),
    byBlockerClass: complete(['none','identity-conflict','unsupported-production-only','conflicting-lineage','ambiguous-lineage'], count(rules, (rule) => rule.blockerClass)), pointerRules: rules.length };
}

function validatePlanEntries(inputs: Inputs, acceptedByPath: Map<string, Set<string>>, conflictsByPath: Map<string, Json>, bundleDocs: Map<string, Json>) {
  const plan = inputs.plan as Json; const publication = inputs.publication as Json;
  const rawDocuments = new Map<string, Json>();
  for (const race of publication.inputs.races) rawDocuments.set(`races/${race.id}`, race);
  for (const metric of publication.inputs.contestMetrics) rawDocuments.set(`contestMetrics/${metric.raceId}`, metric.data);
  let replacements = 0; let merges = 0; let discardedProductionFields = 0; let preservedProductionFields = 0;
  for (const entry of plan.entries) {
    const conflict = conflictsByPath.get(entry.path); expect(conflict !== undefined, 'ENTRY_CONFLICT_MISSING');
    expect(entry.family === conflict.family && entry.rollbackEvidence === 'complete-actual-document-in-immutable-br5b-snapshot', 'ENTRY_CONTRACT_MISMATCH');
    expect(entry.rollbackDigest === conflict.actualDigest && entry.rollbackDigest === semanticDigest(conflict.actual), 'ROLLBACK_DIGEST_MISMATCH');
    expect(conflict.expectedDigest === semanticDigest(conflict.expected) && same(bundleDocs.get(entry.path), conflict.expected), 'EXPECTED_SOURCE_MISMATCH');
    strictFirestoreJson(conflict.actual, `actual/${semanticDigest(entry.path)}`); strictFirestoreJson(conflict.expected, `expected/${semanticDigest(entry.path)}`);
    const differences = entry.family === 'races' ? deriveDifferences(conflict.actual, conflict.expected, '', acceptedByPath.get(entry.path) ?? new Set()) : deriveIdDifferences(conflict.actual, conflict.expected);
    expect(differences.length === entry.pointerRules.length, 'POINTER_RULE_COVERAGE_MISMATCH');
    for (let index = 0; index < differences.length; index += 1) {
      const expected = differences[index]; const rule = entry.pointerRules[index];
      expect(rule.pointer === expected.pointer && rule.kind === expected.kind && rule.actualValueDigest === expected.actualValueDigest && rule.expectedValueDigest === expected.expectedValueDigest, `POINTER_RULE_DIFFERENCE_MISMATCH_${semanticDigest(entry.path).slice(0, 12)}_${index}`);
      expect((rule.identityDigest ?? undefined) === expected.identityDigest && (rule.identitySide ?? undefined) === expected.identitySide, 'POINTER_RULE_IDENTITY_MISMATCH');
      expect(rule.blockerClass === 'none' && ['current-certified-authoritative','existing-value-with-validated-source','runtime-metadata'].includes(rule.provenanceClass), 'UNRESOLVED_PROVENANCE');
      expect(rule.evidenceDigests.length > 0 && same(rule.evidenceDigests, sortedUnique(rule.evidenceDigests)) && rule.evidenceDigests.every((item: string) => HEX.test(item)), 'RULE_EVIDENCE_INVALID');
      if (rule.kind === 'production-only') {
        if (['existing-value-with-validated-source','runtime-metadata'].includes(rule.provenanceClass)) preservedProductionFields += 1; else discardedProductionFields += 1;
        if (rule.provenanceClass === 'existing-value-with-validated-source') expect(semanticDigest(getPointer(rawDocuments.get(entry.path), rule.pointer)) === rule.actualValueDigest, 'PRODUCTION_LINEAGE_MISMATCH');
      }
    }
    const signature = semanticDigest(entry.pointerRules.map((rule: Json) => ({ pointer: rule.pointer.replace(/@(?:id|fec)-sha256:[a-f0-9]{64}/g, '@candidate-id'), kind: rule.kind, provenanceClass: rule.provenanceClass, blockerClass: rule.blockerClass })));
    expect(entry.pointerSignature === signature && same(entry.evidenceDigests, sortedUnique(entry.evidenceDigests)) && entry.evidenceDigests.every((item: string) => HEX.test(item)), 'ENTRY_EVIDENCE_OR_SIGNATURE_INVALID');
    const preserve = entry.pointerRules.filter((rule: Json) => rule.kind === 'production-only' && ['existing-value-with-validated-source','runtime-metadata'].includes(rule.provenanceClass));
    let output: Json;
    if (entry.disposition === 'replace-with-certified') { output = structuredClone(conflict.expected); replacements += 1; }
    else {
      expect(entry.disposition === 'deterministic-merge' && entry.proposedOutputBasis === 'deterministic-merge' && preserve.length > 0, 'UNEXPECTED_DISPOSITION');
      output = structuredClone(conflict.expected); for (const rule of preserve) setPointer(output, rule.pointer, getPointer(conflict.actual, rule.pointer)); merges += 1;
    }
    expect(entry.proposedOutputDigest === semanticDigest(output), 'PROPOSED_OUTPUT_DIGEST_MISMATCH'); strictFirestoreJson(output, `output/${semanticDigest(entry.path)}`);
    const outputDelta = (entry.family === 'races' ? deriveDifferences(output, conflict.expected, '', acceptedByPath.get(entry.path) ?? new Set()) : deriveIdDifferences(output, conflict.expected)).filter((item) => item.kind !== 'reorder');
    const allowed = new Set(preserve.map((rule: Json) => `${rule.pointer}|${rule.actualValueDigest}`));
    expect(outputDelta.every((item) => item.kind === 'production-only' && allowed.has(`${item.pointer}|${item.actualValueDigest}`)), 'OUTPUT_CONTAINS_UNAUTHORIZED_MERGE');
    const protectedPointer = /^\/(?:id|raceId|candidates|eligibleCandidateIds|canonicalPublication|catalogReady|catalogScope|closeAt|closeDate|deadlineKind|deadlineProvenance|electionDate|electionDateSourceUrl|lockPolicyId|lockPolicyVersion|lockReason|metricsReady|office|district|state|mode|officialPollCloseAt|officialPollCloseKind|officialPollCloseProvenance|predictionReady|registryGeneration|researchReady|seatKind|status|verificationLevel)(?:\/|$)/;
    expect(preserve.every((rule: Json) => !protectedPointer.test(rule.pointer) && !/^\/comparativeFinance\/candidates(?:\/|$)/.test(rule.pointer)), 'PROTECTED_FIELD_MUTATION');
    if (entry.disposition === 'replace-with-certified') {
      expect(EXCEPTION_RACES.has(entry.path.slice(6)) && same(output, bundleDocs.get(entry.path)) && getPointer(output, '/updatedAt') === undefined, 'HYBRID_REPLACEMENT_OUTPUT');
      const discarded = entry.pointerRules.filter((rule: Json) => rule.kind === 'production-only' && rule.provenanceClass === 'current-certified-authoritative');
      expect(same(discarded.map((rule: Json) => rule.pointer).sort(), ['/updatedAt/__firestoreType','/updatedAt/nanoseconds','/updatedAt/seconds']), 'STALE_RUNTIME_METADATA_DISPOSITION');
    }
  }
  expect(replacements === 4 && merges === 854 && discardedProductionFields === 12 && preservedProductionFields === 10_177, 'DISPOSITION_COUNT_MISMATCH');
  return { replacements, merges, discardedProductionFields, preservedProductionFields };
}

function validatePlanDigests(plan: Json) {
  const aggregate = aggregateEntries(plan.entries); expect(same(plan.aggregate, aggregate), 'AGGREGATE_RECOMPUTE_MISMATCH');
  const readiness = { readyForExecutor: true, deterministicallyResolved: 858, unresolved: 0, reproducibleOutputs: true, rollbackEvidenceComplete: true, policyConflicts: 0, remainingIdentityConflicts: 0 };
  expect(same(plan.readiness, readiness), 'READINESS_MISMATCH');
  expect(same(plan.safety, { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 }), 'PLAN_SAFETY_MISMATCH');
  const entries = semanticDigest(plan.entries); const aggregateDigest = semanticDigest({ aggregate: plan.aggregate, readiness: plan.readiness, identityResolution: plan.identityResolution.digests });
  const outputs = semanticDigest(plan.entries.map((entry: Json) => ({ path: semanticDigest(entry.path), output: entry.proposedOutputDigest })));
  const rollback = semanticDigest({ entries: plan.entries.map((entry: Json) => ({ path: semanticDigest(entry.path), rollback: entry.rollbackDigest })), aliases: plan.identityResolution.digests.rollbackAliases });
  expect(same(plan.digests, { entries, aggregate: aggregateDigest, outputs, rollback, plan: plan.digests.plan }), 'PLAN_COMPONENT_DIGEST_MISMATCH');
  const base = { ...plan }; delete base.digests;
  const computed = semanticDigest({ ...base, digests: { entries, aggregate: aggregateDigest, outputs, rollback } });
  expect(plan.digests.plan === PLAN_DIGEST && plan.digests.plan === computed, 'PLAN_SEMANTIC_DIGEST_MISMATCH');
}

function staticExecutorSafety(plan: Json) {
  const forbidden = new Set(['write','writes','delete','deletes','scan','scans','collection','collections','selector','selectors','apply','execute','batch','batches','target','projectId','databaseId']); let fields = 0;
  const visit = (value: unknown) => { if (Array.isArray(value)) value.forEach(visit); else if (isRecord(value)) for (const [key, child] of Object.entries(value)) { if (forbidden.has(key)) fields += 1; visit(child); } };
  visit(plan); expect(fields === 0, 'EXECUTOR_OPERATION_FIELD_PRESENT');
  return { forbiddenOperationFields: fields, writes: 0, deletes: 0, scans: 0, collectionWideOperations: 0, selectorChanges: 0, implicitActivations: 0 };
}

export function verifyG8V2ExecutorReadiness(inputs: Inputs) {
  validateIdentities(inputs); validatePlanShape(inputs.plan); validateSourceShapes(inputs); validateBr6bDigests(inputs.br6bPlan as Json);
  const plan = inputs.plan as Json; const snapshot = inputs.snapshot as Json; const bundle = inputs.bundle as Json;
  const bundlePaths = bundle.documents.map((item: Json) => item.path); const conflictPaths = snapshot.conflicts.map((item: Json) => item.path); const entryPaths = plan.entries.map((item: Json) => item.path);
  expect(bundlePaths.length === 3_353 && new Set(bundlePaths).size === 3_353 && bundlePaths.every((path: string, index: number) => index === 0 || bundlePaths[index - 1].localeCompare(path) < 0), 'BUNDLE_INVENTORY_INVALID');
  expect(conflictPaths.length === 858 && new Set(conflictPaths).size === 858 && conflictPaths.every((path: string, index: number) => index === 0 || conflictPaths[index - 1].localeCompare(path) < 0), 'SNAPSHOT_INVENTORY_INVALID');
  expect(entryPaths.length === 858 && new Set(entryPaths).size === 858 && same(entryPaths, conflictPaths), 'PLAN_INVENTORY_INVALID');
  const families = Object.fromEntries(['races','metrics'].map((family) => [family, snapshot.conflicts.filter((item: Json) => item.family === family).length]));
  expect(families.races === 429 && families.metrics === 429 && snapshot.conflicts.every((item: Json) => ['races','metrics'].includes(item.family)), 'FAMILY_COUNT_MISMATCH');
  const bundleDocs = new Map<string, Json>(bundle.documents.filter((item: Json) => item.path !== 'catalogActivations/current').map((item: Json) => [item.path, {
    ...structuredClone(item.data),
    catalogScope: /^(?:races|contestMetrics)\//.test(item.path) ? 'federal' : 'canonical-2026-measures',
    registryGeneration: 'canonical-2026-shadow-v2',
    canonicalActivation: {
      contract: 'g8-3a-v2-activation/v1', identitySchemaVersion: 2, generation: 'canonical-2026-shadow-v2',
      shadowSourceCommit: '295466ccc52ccd4d6ad4f1dfb444d48410b92910', activationImplementationCommit: 'cfff2011ed72f560f531983ce4291237479fa642',
      sourcePath: `migrationShadows/canonical-2026-shadow-v2/${item.path}`,
    },
  }])); const conflictsByPath = new Map<string, Json>(snapshot.conflicts.map((item: Json) => [item.path, item]));
  expect(snapshot.conflicts.every((item: Json) => bundleDocs.has(item.path)), 'SNAPSHOT_PATH_NOT_IN_BUNDLE');
  validateOverrides(inputs, conflictsByPath, bundleDocs); const accepted = validateFecEquivalence(inputs, snapshot.conflicts, bundleDocs);
  const dispositions = validatePlanEntries(inputs, accepted, conflictsByPath, bundleDocs); validatePlanDigests(plan); const executorSafety = staticExecutorSafety(plan);
  return {
    schemaVersion: 1,
    contract: G8_BR7A_RECEIPT_CONTRACT,
    verdict: 'PASS',
    meaning: 'safe-to-design-local-executor-not-production-authorization',
    reviewedCommitRange: { from: '17159857038b90a3659c2435d68806f7b515b0aa', through: '683b5180060b06bedbe3a5c684db563b321f9a8c' },
    identities: { plan: inputs.identities.plan, snapshot: inputs.identities.snapshot, bundle: inputs.identities.bundle, br6bPlan: inputs.identities.br6bPlan, overrides: inputs.identities.overrides },
    counts: { paths: 858, races: 429, metrics: 429, fecEquivalentRaces: 425, fecPairs: 2_097, overrides: 8, ...dispositions },
    digests: { plan: plan.digests.plan, entries: plan.digests.entries, aggregate: plan.digests.aggregate, outputs: plan.digests.outputs, rollback: plan.digests.rollback, overridePolicy: plan.identityResolution.digests.policy },
    invariants: { exactContractsAndKeySets: true, independentlyDerivedInventory: true, sourceOutputsRecomputed: true, rollbackDocumentsReconstructed: true, protectedFieldsUnchanged: true, productionOnlyLineageOrRollback: true, timestampsSafe: true, unresolvedProvenance: 0, p0Findings: 0, p1Findings: 0 },
    executorSafety,
    safety: { firebaseImported: false, credentialsLoaded: false, networkRequests: 0, productionOperations: 0, dispositionsExecuted: 0 },
  } as const;
}
