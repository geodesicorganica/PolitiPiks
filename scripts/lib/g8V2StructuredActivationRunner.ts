import { readFileSync } from 'node:fs';
import {
  buildG8ProductShadowWritePlan,
  createFirestoreG8ProductShadowStore,
  verifyG8ProductShadowNamespace,
  type G8ProductShadowWritePlan,
  type ShadowDocumentStore,
} from './g8ProductShadowExecutor.js';
import {
  buildG8V2ActivationPlan,
  CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  createFirestoreG8V2ActivationStore,
  sameG8V2ActivationData,
  type G8V2ActivationPlan,
  type G8V2ActivationStore,
  type G8V2ActivationWrite,
} from './g8V2Activation.js';
import {
  assertCommittedG8V2Implementation,
  assertG8V2ActivationGuards,
  parseG8V2ActivationArguments,
  resolveG8V2Bundle,
  type G8V2ActivationArguments,
} from './g8V2ActivationCli.js';
import {
  beginG8V2Operations,
  completeG8V2Operations,
  configureG8V2ActivationMode,
  createG8V2StructuredActivationResult,
  failG8V2StructuredActivationResult,
  g8V2OperationOutcomeFromError,
  type G8V2ActivationMode,
  type G8V2ActivationPhase,
  type G8V2StructuredActivationResult,
} from './g8V2ActivationResult.js';
import { loadG8V2StateAuditDotenv, validateG8V2StateAuditEnvironment, type G8V2SafeEnvironmentReport } from './g8V2StateAuditEnvironment.js';
import { validateLocalProductBundle } from './localProductBundle.js';

type Json = Record<string, unknown>;
type OperationMode = Exclude<G8V2ActivationMode, 'unknown'>;
type ReadKind = 'selector' | 'content';
type WriteKind = 'selector' | 'content';

export type G8V2StructuredActivationHooks = {
  beforePhase?: (phase: G8V2ActivationPhase) => void | Promise<void>;
  loadDotenv?: () => void;
  validateEnvironment?: (target: { projectId: string; databaseId: string }, environment: NodeJS.ProcessEnv) => G8V2SafeEnvironmentReport;
  assertImplementation?: (plan: G8V2ActivationPlan) => void;
  bootstrapActivation?: (plan: G8V2ActivationPlan) => Promise<G8V2ActivationStore>;
  bootstrapShadow?: (plan: G8ProductShadowWritePlan) => Promise<ShadowDocumentStore>;
  verifyShadow?: (store: ShadowDocumentStore, plan: G8ProductShadowWritePlan) => Promise<{ contentDigest: string }>;
  offlineBootstrap?: boolean;
  read?: (kind: ReadKind, path: string, defaultRead: () => Promise<Json | null>) => Promise<Json | null>;
  commit?: (kind: WriteKind, writes: readonly G8V2ActivationWrite[], defaultCommit: () => Promise<void>) => Promise<void>;
};

const coded = (code: string) => Object.assign(new Error(code), { activationCode: code });

function modeFromArguments(arguments_: G8V2ActivationArguments): OperationMode {
  if (arguments_.apply) return 'apply';
  if (arguments_.verifyOnly) return 'verify-only';
  if (arguments_.rollback) return 'rollback';
  throw coded('ACTIVATION_MODE_REQUIRED');
}

function setIdentity(result: G8V2StructuredActivationResult, plan: G8V2ActivationPlan) {
  result.identity = {
    projectId: plan.target.projectId,
    databaseId: plan.target.databaseId,
    generation: plan.generation,
    shadowSourceCommit: plan.shadowSourceCommit,
    activationImplementationCommit: plan.activationImplementationCommit,
    namespaceDigest: plan.certifiedDigests.namespace,
    planDigest: plan.planDigest,
    expectedContentDocuments: plan.documents.length,
  };
}

function assertCompatibleSelector(existing: Json, plan: G8V2ActivationPlan) {
  if (existing.contract !== plan.contract) throw coded('SELECTOR_CONFLICT');
  for (const [key, value] of Object.entries(plan.activeSelector)) {
    if (['state', 'activeFederalGeneration', 'activeMeasureGeneration', 'authorizationReceipts'].includes(key)) continue;
    if (!sameG8V2ActivationData(existing[key], value)) throw coded('SELECTOR_CONFLICT');
  }
  if (!['pending', 'active', 'rollback'].includes(String(existing.state))) throw coded('SELECTOR_CONFLICT');
}

async function trackedRead(store: G8V2ActivationStore, kind: ReadKind, path: string, result: G8V2StructuredActivationResult, hooks: G8V2StructuredActivationHooks) {
  const accounting = result.operations.reads[kind];
  beginG8V2Operations(accounting);
  try {
    const value = await (hooks.read ? hooks.read(kind, path, () => store.get(path)) : store.get(path));
    completeG8V2Operations(accounting, 'succeeded');
    return value;
  } catch (error) {
    completeG8V2Operations(accounting, g8V2OperationOutcomeFromError(error));
    throw error;
  }
}

async function trackedCommit(store: G8V2ActivationStore, kind: WriteKind, writes: readonly G8V2ActivationWrite[], result: G8V2StructuredActivationResult, hooks: G8V2StructuredActivationHooks) {
  const accounting = result.operations.writes[kind];
  beginG8V2Operations(accounting, writes.length);
  result.batches.attempted += 1;
  try {
    await (hooks.commit ? hooks.commit(kind, writes, () => store.commit([...writes])) : store.commit([...writes]));
    completeG8V2Operations(accounting, 'succeeded', writes.length);
    result.batches.completed += 1;
  } catch (error) {
    const outcome = g8V2OperationOutcomeFromError(error);
    completeG8V2Operations(accounting, outcome, writes.length);
    if (outcome === 'attempted-unknown') result.batches.unknown += 1;
    else result.batches.failed += 1;
    throw error;
  }
}

async function scanContent(store: G8V2ActivationStore, plan: G8V2ActivationPlan, result: G8V2StructuredActivationResult, hooks: G8V2StructuredActivationHooks, phase: 'content-validation' | 'exact-verification') {
  await hooks.beforePhase?.(phase);
  const content = { expected: plan.documents.length, exact: 0, missing: 0, conflicting: 0, unknown: plan.documents.length };
  const values = new Map<string, Json | null>();
  for (let start = 0; start < plan.documents.length; start += 100) {
    const batch = plan.documents.slice(start, start + 100);
    const outcomes = await Promise.allSettled(batch.map(async (document) => ({ document, actual: await trackedRead(store, 'content', document.path, result, hooks) })));
    let firstError: unknown = null;
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') { firstError ??= outcome.reason; continue; }
      content.unknown -= 1;
      values.set(outcome.value.document.path, outcome.value.actual);
      if (!outcome.value.actual) content.missing += 1;
      else if (sameG8V2ActivationData(outcome.value.actual, outcome.value.document.data)) content.exact += 1;
      else content.conflicting += 1;
    }
    result.content = content;
    if (firstError) throw firstError;
  }
  return { ...content, values };
}

function markPromotedContent(result: G8V2StructuredActivationResult, count: number, outcome: 'succeeded' | 'failed' | 'attempted-unknown') {
  if (outcome === 'succeeded') { result.content.missing -= count; result.content.exact += count; }
  else if (outcome === 'attempted-unknown') { result.content.missing -= count; result.content.unknown += count; }
}

async function runOperation(mode: OperationMode, store: G8V2ActivationStore, plan: G8V2ActivationPlan, result: G8V2StructuredActivationResult, hooks: G8V2StructuredActivationHooks) {
  await hooks.beforePhase?.('selector-read');
  let selector: Json | null;
  try { selector = await trackedRead(store, 'selector', plan.manifestPath, result, hooks); }
  catch (error) { return failG8V2StructuredActivationResult(result, 'selector-read', error); }
  if (!selector) { result.selector.before = 'absent'; result.selector.active = 'absent'; }
  else {
    try { assertCompatibleSelector(selector, plan); }
    catch (error) { result.selector.before = 'incompatible'; result.selector.pending = 'conflicting'; result.selector.active = 'conflicting'; return failG8V2StructuredActivationResult(result, 'selector-read', error); }
    result.selector.before = selector.state as 'pending' | 'active' | 'rollback';
    if (selector.state === 'pending') result.selector.pending = 'compatible';
  }

  if (mode === 'rollback') {
    if (!selector || selector.state !== 'active' || selector.activeFederalGeneration !== plan.generation) return failG8V2StructuredActivationResult(result, 'rollback-selector-write', coded('SELECTOR_CONFLICT'));
    await hooks.beforePhase?.('rollback-selector-write');
    try { await trackedCommit(store, 'selector', [{ operation: 'set', path: plan.manifestPath, data: { ...plan.rollbackSelector, rolledBackAt: new Date().toISOString(), rollbackReason: 'operator-approved selector-only rollback' } }], result, hooks); }
    catch (error) { if (g8V2OperationOutcomeFromError(error) === 'attempted-unknown') result.selector.active = 'unknown'; return failG8V2StructuredActivationResult(result, 'rollback-selector-write', error); }
    result.status = 'completed'; result.phase = 'completed'; result.failedPhase = null; result.error = null;
    result.safeNextAction = 'stop; retained content requires a fresh forward activation plan before any later activation';
    return result;
  }

  if (!selector && mode === 'verify-only') return failG8V2StructuredActivationResult(result, 'selector-read', coded('SELECTOR_CONFLICT'));
  if (selector?.state === 'rollback') return failG8V2StructuredActivationResult(result, 'selector-read', coded('SELECTOR_CONFLICT'));
  if (selector?.state === 'active') {
    if (selector.activeFederalGeneration !== plan.generation || selector.activeMeasureGeneration !== plan.generation) return failG8V2StructuredActivationResult(result, 'selector-read', coded('SELECTOR_CONFLICT'));
    try {
      const exact = await scanContent(store, plan, result, hooks, 'exact-verification');
      if (exact.missing || exact.conflicting || exact.unknown) throw coded('EXACT_VERIFICATION_FAILED');
    } catch (error) { return failG8V2StructuredActivationResult(result, 'exact-verification', error); }
    result.selector.active = 'verified'; result.status = 'completed'; result.phase = 'completed'; result.failedPhase = null; result.error = null;
    result.safeNextAction = mode === 'verify-only' ? 'record the verified active result; any live smoke requires separate authorization' : 'record the compatible active no-op result; do not invoke activation again';
    return result;
  }

  if (mode === 'verify-only') return failG8V2StructuredActivationResult(result, 'selector-read', coded('SELECTOR_CONFLICT'));
  let initial;
  try {
    initial = await scanContent(store, plan, result, hooks, 'content-validation');
    if (initial.conflicting) throw coded('CONTENT_CONFLICT');
  } catch (error) { return failG8V2StructuredActivationResult(result, 'content-validation', error); }

  if (!selector) {
    await hooks.beforePhase?.('pending-selector-write');
    try { await trackedCommit(store, 'selector', [{ operation: 'create', path: plan.manifestPath, data: { ...plan.pendingSelector, pendingAt: new Date().toISOString() } }], result, hooks); result.selector.pending = 'created'; }
    catch (error) { result.selector.pending = g8V2OperationOutcomeFromError(error) === 'attempted-unknown' ? 'unknown' : 'conflicting'; return failG8V2StructuredActivationResult(result, 'pending-selector-write', error); }
  }

  await hooks.beforePhase?.('content-promotion');
  const missing = plan.documents.filter((document) => initial.values.get(document.path) === null);
  for (let start = 0; start < missing.length; start += 399) {
    const batch = missing.slice(start, start + 399).map((document) => ({ operation: 'create' as const, path: document.path, data: document.data }));
    try { await trackedCommit(store, 'content', batch, result, hooks); markPromotedContent(result, batch.length, 'succeeded'); }
    catch (error) { markPromotedContent(result, batch.length, g8V2OperationOutcomeFromError(error)); return failG8V2StructuredActivationResult(result, 'content-promotion', error); }
  }
  try {
    const exact = await scanContent(store, plan, result, hooks, 'exact-verification');
    if (exact.missing || exact.conflicting || exact.unknown) throw coded('EXACT_VERIFICATION_FAILED');
  } catch (error) { return failG8V2StructuredActivationResult(result, 'exact-verification', error); }
  await hooks.beforePhase?.('active-selector-write');
  try { await trackedCommit(store, 'selector', [{ operation: 'set', path: plan.manifestPath, data: { ...plan.activeSelector, activatedAt: new Date().toISOString() } }], result, hooks); }
  catch (error) { result.selector.active = g8V2OperationOutcomeFromError(error) === 'attempted-unknown' ? 'unknown' : 'absent'; return failG8V2StructuredActivationResult(result, 'active-selector-write', error); }
  result.selector.active = 'written'; result.status = 'completed'; result.phase = 'completed'; result.failedPhase = null; result.error = null;
  result.safeNextAction = 'record the active result; any verify-only or live smoke operation requires separate authorization';
  return result;
}

export async function runG8V2StructuredActivation(argv: readonly string[], hooks: G8V2StructuredActivationHooks = {}): Promise<G8V2StructuredActivationResult> {
  const result = createG8V2StructuredActivationResult();
  let parsed: G8V2ActivationArguments;
  let mode: OperationMode;
  let bundle: ReturnType<typeof validateLocalProductBundle>;
  let manifest: unknown;
  let shadowPlan: G8ProductShadowWritePlan;
  let plan: G8V2ActivationPlan;
  let store: G8V2ActivationStore;
  let shadowStore: ShadowDocumentStore | null = null;

  try { await hooks.beforePhase?.('argument-parsing'); parsed = parseG8V2ActivationArguments([...argv]); mode = modeFromArguments(parsed); configureG8V2ActivationMode(result, mode); }
  catch (error) { return failG8V2StructuredActivationResult(result, 'argument-parsing', error); }
  try {
    await hooks.beforePhase?.('bundle-manifest-validation');
    const bundlePath = resolveG8V2Bundle(parsed.bundleIn!);
    bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
    manifest = JSON.parse(readFileSync(parsed.manifest ?? 'docs/g8-catalog-beta-release-manifest.json', 'utf8')) as unknown;
  } catch (error) { return failG8V2StructuredActivationResult(result, 'bundle-manifest-validation', error); }
  try {
    await hooks.beforePhase?.('plan-guard-validation');
    shadowPlan = buildG8ProductShadowWritePlan(bundle!, parsed.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
    plan = buildG8V2ActivationPlan(shadowPlan, {
      shadowVerification: parsed.shadowVerificationReceipt!, promotion: parsed.promotionReceipt!, activation: parsed.activationReceipt!, rollback: parsed.rollbackReceipt!,
    }, { identitySchemaVersion: 2, shadowSourceCommit: parsed.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: parsed.expectedActivationImplementationCommit ?? '' });
    assertG8V2ActivationGuards(parsed, plan, manifest);
    setIdentity(result, plan);
  } catch (error) { return failG8V2StructuredActivationResult(result, 'plan-guard-validation', error); }
  try { await hooks.beforePhase?.('implementation-identity'); (hooks.assertImplementation ?? ((candidate) => { assertCommittedG8V2Implementation({ identitySchemaVersion: 2, shadowSourceCommit: candidate.shadowSourceCommit, activationImplementationCommit: candidate.activationImplementationCommit }); }))(plan!); }
  catch (error) { return failG8V2StructuredActivationResult(result, 'implementation-identity', error); }
  try { await hooks.beforePhase?.('environment-validation'); (hooks.loadDotenv ?? loadG8V2StateAuditDotenv)(); (hooks.validateEnvironment ?? validateG8V2StateAuditEnvironment)(plan!.target, process.env); }
  catch (error) { return failG8V2StructuredActivationResult(result, 'environment-validation', error); }
  try {
    await hooks.beforePhase?.('firestore-bootstrap');
    result.firebase.initialization = hooks.offlineBootstrap ? 'not-attempted' : 'attempted-failed'; result.firebase.bootstrap = hooks.offlineBootstrap ? 'not-attempted' : 'attempted-failed';
    store = await (hooks.bootstrapActivation ?? createFirestoreG8V2ActivationStore)(plan!);
    if (mode! !== 'rollback') shadowStore = await (hooks.bootstrapShadow ?? createFirestoreG8ProductShadowStore)(shadowPlan!);
    if (!hooks.offlineBootstrap) { result.firebase.initialization = 'succeeded'; result.firebase.bootstrap = 'succeeded'; }
  } catch (error) { return failG8V2StructuredActivationResult(result, 'firestore-bootstrap', error); }
  if (mode! !== 'rollback') {
    try {
      await hooks.beforePhase?.('shadow-verification');
      const verified = await (hooks.verifyShadow ?? verifyG8ProductShadowNamespace)(shadowStore!, shadowPlan!);
      if (verified.contentDigest !== plan!.certifiedDigests.namespace) throw coded('SHADOW_VERIFICATION_FAILED');
    } catch (error) { return failG8V2StructuredActivationResult(result, 'shadow-verification', error); }
  }

  return runOperation(mode!, store!, plan!, result, hooks);
}
