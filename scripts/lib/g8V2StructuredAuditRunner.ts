import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan, type G8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, createFirestoreG8V2ActivationAuditStore, sameG8V2ActivationData, type G8V2ActivationAuditStore, type G8V2ActivationPlan } from './g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertCommittedG8V2StateAuditImplementation, assertG8V2ActivationGuards, parseG8V2ActivationArguments, resolveG8V2Bundle, type G8V2ActivationArguments } from './g8V2ActivationCli.js';
import { validateLocalProductBundle } from './localProductBundle.js';
import { loadG8V2StateAuditDotenv, validateG8V2StateAuditEnvironment, type G8V2SafeEnvironmentReport } from './g8V2StateAuditEnvironment.js';
import { beginG8V2Read, completeG8V2Read, createG8V2StructuredAuditResult, failG8V2StructuredAuditResult, readOutcomeFromG8V2Error, type G8V2StructuredAuditResult, type G8V2StateAuditPhase } from './g8V2StateAuditResult.js';

type Json = Record<string, unknown>;
type ParsedAuditArguments = G8V2ActivationArguments & { auditReceipt: string; stateAuditImplementationCommit: string };
type AuditReadKind = 'selector' | 'exact-path';

export type G8V2StructuredAuditHooks = {
  beforePhase?: (phase: G8V2StateAuditPhase) => void | Promise<void>;
  loadDotenv?: () => void;
  validateEnvironment?: (target: { projectId: string; databaseId: string }, environment: NodeJS.ProcessEnv) => G8V2SafeEnvironmentReport;
  bootstrap?: (plan: G8V2ActivationPlan) => Promise<G8V2ActivationAuditStore>;
  read?: (kind: AuditReadKind, path: string, defaultRead: () => Promise<Json | null>) => Promise<Json | null>;
};

function customFlagValue(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index === -1 ? '' : argv[index + 1] ?? '';
}

function parseAuditArguments(argv: readonly string[]): ParsedAuditArguments {
  const auditReceipt = customFlagValue(argv, '--audit-receipt');
  const stateAuditImplementationCommit = customFlagValue(argv, '--expected-state-audit-implementation-commit');
  if (!argv.includes('--audit')) throw Object.assign(new Error('audit mode required'), { auditCode: 'AUDIT_MODE_REQUIRED' });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(auditReceipt)) throw Object.assign(new Error('audit receipt invalid'), { auditCode: 'INVALID_ARGUMENT' });
  if (!/^[a-f0-9]{7,64}$/i.test(stateAuditImplementationCommit)) throw Object.assign(new Error('state audit implementation identity invalid'), { auditCode: 'INVALID_ARGUMENT' });
  const parserArguments: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--audit-receipt' || argv[index] === '--expected-state-audit-implementation-commit') { index += 1; continue; }
    parserArguments.push(argv[index]);
  }
  const parsed = parseG8V2ActivationArguments(parserArguments);
  if (!parsed.audit) throw Object.assign(new Error('audit mode required'), { auditCode: 'AUDIT_MODE_REQUIRED' });
  return { ...parsed, auditReceipt, stateAuditImplementationCommit };
}

function safeNextAction(state: string, content: G8V2StructuredAuditResult['contentAudit']) {
  if (state === 'absent' || state === 'legacy' || state === 'incompatible') return 'separately authorize a fresh v2 activation recovery';
  if (state === 'pending' && content && content.conflicting === 0) return 'separately authorize a compatible v2 resume';
  if (state === 'active' && content && content.exact === content.expected) return 'separately authorize live smoke verification';
  if (state === 'rollback') return 'require a fresh forward activation plan';
  return 'stop for review';
}

function expectedSelector(plan: G8V2ActivationPlan, state: 'pending' | 'active' | 'rollback') {
  return state === 'pending' ? plan.pendingSelector : state === 'active' ? plan.activeSelector : plan.rollbackSelector;
}

function assessSelector(selector: Json | null, plan: G8V2ActivationPlan) {
  if (!selector) return { state: 'absent', contract: null, metadata: { status: 'not-applicable' as const, conflictingFields: 0 }, scan: false };
  const contract = typeof selector.contract === 'string' ? selector.contract : null;
  if (contract !== plan.contract) return { state: contract ? 'legacy' : 'incompatible', contract, metadata: { status: 'not-applicable' as const, conflictingFields: 0 }, scan: false };
  const rawState = selector.state;
  if (rawState !== 'pending' && rawState !== 'active' && rawState !== 'rollback') return { state: 'malformed', contract, metadata: { status: 'conflicting' as const, conflictingFields: 1 }, scan: false };
  const expected = expectedSelector(plan, rawState);
  const ignored = new Set(['pendingAt', 'activatedAt', 'rolledBackAt', 'rollbackReason']);
  const conflicts = Object.keys(expected).filter((key) => !ignored.has(key) && !sameG8V2ActivationData(selector[key], expected[key] ?? null));
  return { state: rawState, contract, metadata: { status: conflicts.length ? 'conflicting' as const : 'matching' as const, conflictingFields: conflicts.length }, scan: true };
}

function setIdentity(result: G8V2StructuredAuditResult, plan: G8V2ActivationPlan) {
  result.identity = { projectId: plan.target.projectId, databaseId: plan.target.databaseId, generation: plan.generation, namespaceDigest: plan.certifiedDigests.namespace, planDigest: plan.planDigest, expectedContentDocuments: plan.documents.length };
}

async function trackedRead(store: G8V2ActivationAuditStore, kind: AuditReadKind, path: string, result: G8V2StructuredAuditResult, hooks: G8V2StructuredAuditHooks) {
  const accounting = kind === 'selector' ? result.reads.selector : result.reads.exactPaths;
  beginG8V2Read(accounting);
  try {
    const value = await (hooks.read ? hooks.read(kind, path, () => store.get(path)) : store.get(path));
    completeG8V2Read(accounting, 'succeeded');
    return value;
  } catch (error) {
    completeG8V2Read(accounting, readOutcomeFromG8V2Error(error));
    throw error;
  }
}

export async function runG8V2StructuredAudit(argv: readonly string[], hooks: G8V2StructuredAuditHooks = {}): Promise<G8V2StructuredAuditResult> {
  const result = createG8V2StructuredAuditResult();
  let parsed: ParsedAuditArguments;
  let plan: G8V2ActivationPlan;
  let bundle: ReturnType<typeof validateLocalProductBundle>;
  let manifest: unknown;
  let store: G8V2ActivationAuditStore;

  try { await hooks.beforePhase?.('argument-parsing'); parsed = parseAuditArguments(argv); result.auditReceipt = parsed.auditReceipt; } catch (error) { return failG8V2StructuredAuditResult(result, 'argument-parsing', error); }
  try {
    await hooks.beforePhase?.('bundle-manifest-validation');
    const bundlePath = resolveG8V2Bundle(parsed.bundleIn!);
    bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
    manifest = JSON.parse(readFileSync(parsed.manifest ?? 'docs/g8-catalog-beta-release-manifest.json', 'utf8')) as unknown;
  } catch (error) { return failG8V2StructuredAuditResult(result, 'bundle-manifest-validation', error); }
  try {
    await hooks.beforePhase?.('plan-guard-validation');
    const shadowPlan: G8ProductShadowWritePlan = buildG8ProductShadowWritePlan(bundle!, parsed.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
    plan = buildG8V2ActivationPlan(shadowPlan, { shadowVerification: parsed.shadowVerificationReceipt!, promotion: parsed.promotionReceipt!, activation: parsed.activationReceipt!, rollback: parsed.rollbackReceipt! }, { identitySchemaVersion: 2, shadowSourceCommit: parsed.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: parsed.expectedActivationImplementationCommit ?? '' });
    assertG8V2ActivationGuards(parsed, plan, manifest);
    setIdentity(result, plan);
  } catch (error) { return failG8V2StructuredAuditResult(result, 'plan-guard-validation', error); }
  try { await hooks.beforePhase?.('implementation-identity'); assertCommittedG8V2Implementation({ identitySchemaVersion: 2, shadowSourceCommit: plan!.shadowSourceCommit, activationImplementationCommit: plan!.activationImplementationCommit }); assertCommittedG8V2StateAuditImplementation(parsed.stateAuditImplementationCommit); } catch (error) { return failG8V2StructuredAuditResult(result, 'implementation-identity', error); }
  try {
    await hooks.beforePhase?.('environment-validation');
    (hooks.loadDotenv ?? loadG8V2StateAuditDotenv)();
    const report = (hooks.validateEnvironment ?? validateG8V2StateAuditEnvironment)(plan!.target, process.env);
    result.environment = report;
  } catch (error) {
    const report = error && typeof error === 'object' && 'report' in error ? error.report : null;
    if (report && typeof report === 'object') result.environment = report as G8V2StructuredAuditResult['environment'];
    return failG8V2StructuredAuditResult(result, 'environment-validation', error);
  }
  try { await hooks.beforePhase?.('firestore-bootstrap'); result.firebase.initialization = 'attempted-failed'; result.firebase.bootstrap = 'attempted-failed'; store = await (hooks.bootstrap ?? createFirestoreG8V2ActivationAuditStore)(plan!); result.firebase.initialization = 'succeeded'; result.firebase.bootstrap = 'succeeded'; } catch (error) { return failG8V2StructuredAuditResult(result, 'firestore-bootstrap', error); }
  let selector: Json | null;
  try { await hooks.beforePhase?.('selector-read'); selector = await trackedRead(store!, 'selector', plan!.manifestPath, result, hooks); } catch (error) { return failG8V2StructuredAuditResult(result, 'selector-read', error); }
  const assessment = assessSelector(selector, plan!);
  result.selector = { state: assessment.state, contract: assessment.contract, metadata: assessment.metadata };
  if (!assessment.scan) { result.status = 'completed'; result.phase = 'completed'; result.failedPhase = null; result.safeNextAction = safeNextAction(assessment.state, null); return result; }
  const content = { expected: plan!.documents.length, exact: 0, missing: 0, conflicting: 0 };
  try {
    await hooks.beforePhase?.('exact-path-reads');
    for (const document of plan!.documents) {
      const actual = await trackedRead(store!, 'exact-path', document.path, result, hooks);
      if (!actual) content.missing += 1;
      else if (sameG8V2ActivationData(actual, document.data)) content.exact += 1;
      else content.conflicting += 1;
    }
  } catch (error) {
    result.contentAudit = content;
    return failG8V2StructuredAuditResult(result, 'exact-path-reads', error);
  }
  result.contentAudit = content;
  if (assessment.metadata.conflictingFields > 0 || content.conflicting > 0) result.selector.state = 'conflict';
  result.status = 'completed'; result.phase = 'completed'; result.failedPhase = null; result.safeNextAction = safeNextAction(result.selector.state, content);
  return result;
}
