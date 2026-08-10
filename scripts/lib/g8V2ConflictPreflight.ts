import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative } from 'node:path';
import { TextDecoder } from 'node:util';
import { G8_V2_CONFLICT_ANALYSIS_CONTRACT, G8_V2_CONFLICT_SNAPSHOT_CONTRACT } from './g8V2ConflictAnalysis.js';
import { assertCommittedG8V2ConflictAnalysisImplementation, assertG8V2ConflictLiveGuards, buildG8V2ConflictCertifiedPlan, isG8V2ConflictPrivateRootIgnored, parseG8V2ConflictCliArguments } from './g8V2ConflictCli.js';
import { buildG8V2DirectNodeTsxInvocation, type G8V2DirectNodeTsxInvocation } from './g8V2StateAuditPreflight.js';

const require = createRequire(import.meta.url);
const CAPTURE_SCRIPT = 'scripts/report-g8-4br5a-conflicts.ts' as const;
const ORDERED_FLAGS = [
  '--snapshot-out','--bundle-in','--manifest','--project-id','--database-id','--generation','--expected-shadow-source-commit',
  '--expected-activation-implementation-commit','--expected-conflict-analysis-implementation-commit','--expected-namespace-digest',
  '--expected-activation-plan-digest','--expected-content-documents','--capture-receipt',
] as const;

export const G8_V2_CONFLICT_PREFLIGHT_CONTRACT = 'g8-4br5a-conflict-capture-preflight/v1' as const;
export const G8_V2_CONFLICT_PREFLIGHT_PHASE = 'g8-4br5a-firebase-free-conflict-capture-preflight' as const;

type Json = Record<string, unknown>;
type OrderedFlag = typeof ORDERED_FLAGS[number];
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('unsupported conflict-preflight value'); return encoded;
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const assertKeys = (value: Json, allowed: readonly string[], at: string) => {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new Error(`unexpected ${at} field: ${key}`);
  for (const key of allowed) if (!(key in value)) throw new Error(`missing ${at} field: ${key}`);
};

export type G8V2ConflictPreflightOptions = {
  bundlePath: string;
  manifestPath: string;
  snapshotOutPath: string;
  captureReceipt: string;
  activationImplementationCommit: string;
  conflictAnalysisImplementationCommit: string;
  verifyImplementation?: boolean;
};

export type G8V2ConflictPreflightOutput = {
  phase: typeof G8_V2_CONFLICT_PREFLIGHT_PHASE;
  firebaseInitialization: false;
  credentialsLoaded: false;
  reads: 0;
  writes: 0;
  commandsExecuted: 0;
  identity: { shadowSourceCommit: string; activationImplementationCommit: string; conflictAnalysisImplementationCommit: string };
  target: { projectId: string; databaseId: string; generation: string };
  inventory: { selectorPath: 'catalogActivations/canonical-2026'; selectorReads: 1; exactPathReads: 3352; totalReads: 3353; writes: 0; collectionScans: 0; expectedCounts: unknown; pathDigest: string };
  certifiedDigests: { namespace: string; activationPlan: string; bundle: string };
  snapshot: { contract: typeof G8_V2_CONFLICT_SNAPSHOT_CONTRACT; analysisContract: typeof G8_V2_CONFLICT_ANALYSIS_CONTRACT; digestFields: ['inventory','input','evidence','plan']; losslessActualConflicts: true };
  output: { path: string; absent: true; ignored: true; noClobber: true };
  capture: G8V2DirectNodeTsxInvocation;
  canonicalReceipt?: G8V2ConflictPreflightReceipt;
  canonicalDigest?: string;
};

export type G8V2ConflictPreflightReceipt = {
  contract: typeof G8_V2_CONFLICT_PREFLIGHT_CONTRACT;
  phase: typeof G8_V2_CONFLICT_PREFLIGHT_PHASE;
  target: G8V2ConflictPreflightOutput['target'];
  implementationIdentities: G8V2ConflictPreflightOutput['identity'];
  inventory: G8V2ConflictPreflightOutput['inventory'];
  certifiedDigests: G8V2ConflictPreflightOutput['certifiedDigests'];
  snapshot: G8V2ConflictPreflightOutput['snapshot'];
  output: G8V2ConflictPreflightOutput['output'];
  launcher: { contract: 'direct-node-tsx/v1'; executable: string; cwd: string; tsxCliPath: string; scriptPath: typeof CAPTURE_SCRIPT; shell: false; argumentCount: 28; arguments: string[]; argumentsDigest: string };
  captureReceipt: string;
  safety: { firebaseInitialization: false; credentialsLoaded: false; preflightReads: 0; preflightWrites: 0; commandsExecuted: 0; futureSelectorReads: 1; futureExactPathReads: 3352; futureTotalReads: 3353; futureWrites: 0; futureCollectionScans: 0; shell: false; authorizationCreated: false };
};

function args(options: G8V2ConflictPreflightOptions, plan: ReturnType<typeof buildG8V2ConflictCertifiedPlan>['plan']) {
  return [
    '--snapshot-out', options.snapshotOutPath,
    '--bundle-in', options.bundlePath,
    '--manifest', options.manifestPath,
    '--project-id', plan.target.projectId,
    '--database-id', plan.target.databaseId,
    '--generation', plan.generation,
    '--expected-shadow-source-commit', plan.shadowSourceCommit,
    '--expected-activation-implementation-commit', options.activationImplementationCommit,
    '--expected-conflict-analysis-implementation-commit', options.conflictAnalysisImplementationCommit,
    '--expected-namespace-digest', plan.certifiedDigests.namespace,
    '--expected-activation-plan-digest', plan.planDigest,
    '--expected-content-documents', '3352',
    '--capture-receipt', options.captureReceipt,
  ];
}

export function buildG8V2ConflictPreflightOutput(options: G8V2ConflictPreflightOptions): G8V2ConflictPreflightOutput {
  const built = buildG8V2ConflictCertifiedPlan(options.bundlePath, options.manifestPath);
  const { plan, bundle } = built;
  if (built.activationImplementationCommit !== options.activationImplementationCommit) throw new Error('conflict preflight activation implementation identity mismatch');
  const invocation = buildG8V2DirectNodeTsxInvocation(CAPTURE_SCRIPT, args(options, plan));
  const parsed = parseG8V2ConflictCliArguments(invocation.arguments.slice(2));
  assertG8V2ConflictLiveGuards(parsed, plan, { verifyImplementation: false });
  if (options.verifyImplementation !== false) assertCommittedG8V2ConflictAnalysisImplementation(options.conflictAnalysisImplementationCommit);
  if (existsSync(parsed.snapshotPath)) throw new Error('future conflict snapshot output already exists');
  if (!isG8V2ConflictPrivateRootIgnored()) throw new Error('future conflict snapshot directory is not ignored');
  const outputPath = relative(process.cwd(), parsed.snapshotPath).replace(/\\/g, '/');
  const output: G8V2ConflictPreflightOutput = {
    phase: G8_V2_CONFLICT_PREFLIGHT_PHASE, firebaseInitialization: false, credentialsLoaded: false, reads: 0, writes: 0, commandsExecuted: 0,
    identity: { shadowSourceCommit: plan.shadowSourceCommit, activationImplementationCommit: plan.activationImplementationCommit, conflictAnalysisImplementationCommit: options.conflictAnalysisImplementationCommit },
    target: { projectId: plan.target.projectId, databaseId: plan.target.databaseId, generation: plan.generation },
    inventory: { selectorPath: plan.manifestPath, selectorReads: 1, exactPathReads: 3352, totalReads: 3353, writes: 0, collectionScans: 0, expectedCounts: plan.expectedCounts, pathDigest: digest(plan.documents.map((document) => ({ path: document.path, expectedDigest: digest(document.data) }))) },
    certifiedDigests: { namespace: plan.certifiedDigests.namespace, activationPlan: plan.planDigest, bundle: bundle.bundleDigest },
    snapshot: { contract: G8_V2_CONFLICT_SNAPSHOT_CONTRACT, analysisContract: G8_V2_CONFLICT_ANALYSIS_CONTRACT, digestFields: ['inventory','input','evidence','plan'], losslessActualConflicts: true },
    output: { path: outputPath, absent: true, ignored: true, noClobber: true },
    capture: invocation,
  };
  const canonical = buildG8V2ConflictPreflightReceipt(output);
  return { ...output, canonicalReceipt: canonical.receipt, canonicalDigest: canonical.digest };
}

function orderedValues(arguments_: readonly string[]) {
  if (arguments_.length !== 28) throw new Error('conflict preflight requires exactly 28 ordered arguments');
  if (arguments_[0] !== require.resolve('tsx/cli') || !isAbsolute(arguments_[0]) || arguments_[1] !== CAPTURE_SCRIPT) throw new Error('conflict preflight requires repository-resolved tsx and the bounded capture script');
  const values = {} as Record<OrderedFlag, string>;
  ORDERED_FLAGS.forEach((flag, index) => {
    const offset = 2 + index * 2;
    if (arguments_[offset] !== flag || !arguments_[offset + 1] || arguments_[offset + 1].startsWith('--')) throw new Error(`conflict preflight ordered flag mismatch: ${flag}`);
    values[flag] = arguments_[offset + 1];
  });
  return values;
}

export function buildG8V2ConflictPreflightReceipt(value: unknown) {
  if (!isRecord(value) || value.phase !== G8_V2_CONFLICT_PREFLIGHT_PHASE || value.firebaseInitialization !== false || value.credentialsLoaded !== false || value.reads !== 0 || value.writes !== 0 || value.commandsExecuted !== 0
    || !isRecord(value.identity) || !isRecord(value.target) || !isRecord(value.inventory) || !isRecord(value.certifiedDigests) || !isRecord(value.snapshot) || !isRecord(value.output) || !isRecord(value.capture)) throw new Error('malformed or non-Firebase-free conflict preflight');
  const rootRequired = ['phase','firebaseInitialization','credentialsLoaded','reads','writes','commandsExecuted','identity','target','inventory','certifiedDigests','snapshot','output','capture'] as const;
  const rootAllowed = new Set([...rootRequired, 'canonicalReceipt', 'canonicalDigest']);
  for (const key of Object.keys(value)) if (!rootAllowed.has(key)) throw new Error(`unexpected conflict preflight field: ${key}`);
  for (const key of rootRequired) if (!(key in value)) throw new Error(`missing conflict preflight field: ${key}`);
  assertKeys(value.identity, ['shadowSourceCommit','activationImplementationCommit','conflictAnalysisImplementationCommit'], 'conflict preflight identity');
  assertKeys(value.target, ['projectId','databaseId','generation'], 'conflict preflight target');
  assertKeys(value.inventory, ['selectorPath','selectorReads','exactPathReads','totalReads','writes','collectionScans','expectedCounts','pathDigest'], 'conflict preflight inventory');
  assertKeys(value.certifiedDigests, ['namespace','activationPlan','bundle'], 'conflict preflight digests');
  assertKeys(value.snapshot, ['contract','analysisContract','digestFields','losslessActualConflicts'], 'conflict preflight snapshot');
  assertKeys(value.output, ['path','absent','ignored','noClobber'], 'conflict preflight output');
  assertKeys(value.capture, ['executable','arguments','cwd'], 'conflict preflight launcher');
  const output = value as G8V2ConflictPreflightOutput;
  if (output.capture.executable !== process.execPath || !isAbsolute(output.capture.executable) || output.capture.cwd !== process.cwd() || !isAbsolute(output.capture.cwd)) throw new Error('conflict preflight requires direct Node and absolute cwd');
  const values = orderedValues(output.capture.arguments);
  if (values['--project-id'] !== output.target.projectId || values['--database-id'] !== output.target.databaseId || values['--generation'] !== output.target.generation
    || values['--expected-shadow-source-commit'] !== output.identity.shadowSourceCommit || values['--expected-activation-implementation-commit'] !== output.identity.activationImplementationCommit
    || values['--expected-conflict-analysis-implementation-commit'] !== output.identity.conflictAnalysisImplementationCommit
    || values['--expected-namespace-digest'] !== output.certifiedDigests.namespace || values['--expected-activation-plan-digest'] !== output.certifiedDigests.activationPlan
    || values['--expected-content-documents'] !== '3352'
    || relative(process.cwd(), parseG8V2ConflictCliArguments(output.capture.arguments.slice(2)).snapshotPath).replace(/\\/g, '/') !== output.output.path) throw new Error('conflict preflight invocation differs from receipt body');
  if (output.inventory.selectorReads !== 1 || output.inventory.exactPathReads !== 3352 || output.inventory.totalReads !== 3353 || output.inventory.writes !== 0 || output.inventory.collectionScans !== 0
    || output.output.absent !== true || output.output.ignored !== true || output.output.noClobber !== true || output.snapshot.contract !== G8_V2_CONFLICT_SNAPSHOT_CONTRACT || output.snapshot.analysisContract !== G8_V2_CONFLICT_ANALYSIS_CONTRACT
    || canonicalJson(output.snapshot.digestFields) !== canonicalJson(['inventory','input','evidence','plan']) || output.snapshot.losslessActualConflicts !== true
    || !isRecord(output.inventory.expectedCounts) || output.inventory.expectedCounts.contentDocuments !== 3352 || output.inventory.expectedCounts.totalBundleDocuments !== 3353 || output.inventory.expectedCounts.selectorsExcluded !== 1
    || !/^[a-f0-9]{40}$/.test(output.identity.shadowSourceCommit) || !/^[a-f0-9]{40}$/.test(output.identity.activationImplementationCommit) || !/^[a-f0-9]{40}$/.test(output.identity.conflictAnalysisImplementationCommit)
    || !/^[a-f0-9]{64}$/.test(output.inventory.pathDigest) || !/^[a-f0-9]{64}$/.test(output.certifiedDigests.namespace) || !/^[a-f0-9]{64}$/.test(output.certifiedDigests.activationPlan) || !/^[a-f0-9]{64}$/.test(output.certifiedDigests.bundle)) throw new Error('conflict preflight bounds or digest contract differs');
  const captureReceipt = values['--capture-receipt'];
  if (!/^g8-4br5b-[a-z0-9._:-]+$/.test(captureReceipt)) throw new Error('invalid future G8.4BR5B capture receipt label');
  const receipt: G8V2ConflictPreflightReceipt = {
    contract: G8_V2_CONFLICT_PREFLIGHT_CONTRACT, phase: output.phase, target: output.target, implementationIdentities: output.identity,
    inventory: output.inventory, certifiedDigests: output.certifiedDigests, snapshot: output.snapshot, output: output.output,
    launcher: { contract: 'direct-node-tsx/v1', executable: output.capture.executable, cwd: output.capture.cwd, tsxCliPath: output.capture.arguments[0], scriptPath: CAPTURE_SCRIPT, shell: false, argumentCount: 28, arguments: [...output.capture.arguments], argumentsDigest: digest(output.capture.arguments) },
    captureReceipt,
    safety: { firebaseInitialization: false, credentialsLoaded: false, preflightReads: 0, preflightWrites: 0, commandsExecuted: 0, futureSelectorReads: 1, futureExactPathReads: 3352, futureTotalReads: 3353, futureWrites: 0, futureCollectionScans: 0, shell: false, authorizationCreated: false },
  };
  return { receipt, digest: digest(receipt) };
}

export function parseG8V2ConflictPreflightOutput(raw: string | Uint8Array) {
  const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const start = text.replace(/^\uFEFF/, '').indexOf('{');
  if (start < 0) throw new Error('conflict preflight output does not contain JSON');
  const value = JSON.parse(text.replace(/^\uFEFF/, '').slice(start).trim()) as unknown;
  const canonical = buildG8V2ConflictPreflightReceipt(value);
  const embedded = value as G8V2ConflictPreflightOutput;
  if (embedded.canonicalDigest !== undefined && embedded.canonicalDigest !== canonical.digest) throw new Error('embedded conflict preflight digest mismatch');
  if (embedded.canonicalReceipt !== undefined && canonicalJson(embedded.canonicalReceipt) !== canonicalJson(canonical.receipt)) throw new Error('embedded conflict preflight receipt mismatch');
  return { output: embedded, ...canonical };
}
