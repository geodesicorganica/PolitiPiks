import { sameG8V2ActivationData, type G8V2ActivationAuditStore, type G8V2ActivationPlan } from './g8V2Activation.js';

type Json = Record<string, unknown>;
export type G8V2StateAuditSelectorState = 'absent' | 'legacy' | 'incompatible' | 'malformed' | 'pending' | 'active' | 'rollback' | 'conflict';

export type G8V2StateAuditResult = {
  auditReceipt: string;
  readsPerformed: { selector: number; expectedActivePaths: number; total: number; selectorReadFirst: boolean };
  selector: { state: G8V2StateAuditSelectorState; contract: string | null; metadata: { status: 'not-applicable' | 'matching' | 'conflicting'; conflictingFields: number } };
  contentAudit: null | { expected: number; exact: number; missing: number; conflicting: number };
  safeNextAction: string;
};

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const isV2State = (value: unknown): value is 'pending' | 'active' | 'rollback' => value === 'pending' || value === 'active' || value === 'rollback';
const safeNextActionFor = (state: G8V2StateAuditSelectorState, content: G8V2StateAuditResult['contentAudit']) => {
  if (state === 'absent' || state === 'legacy' || state === 'incompatible') return 'separately authorize a fresh v2 activation recovery';
  if (state === 'pending' && content && content.conflicting === 0) return 'separately authorize a compatible v2 resume';
  if (state === 'active' && content && content.exact === content.expected) return 'separately authorize live smoke verification';
  if (state === 'rollback') return 'require a fresh forward activation plan';
  return 'stop for review';
};

function expectedSelectorFor(plan: G8V2ActivationPlan, state: 'pending' | 'active' | 'rollback') {
  return state === 'pending' ? plan.pendingSelector : state === 'active' ? plan.activeSelector : plan.rollbackSelector;
}

function selectorMetadataConflicts(selector: Json, expected: Json) {
  const ignored = new Set(['pendingAt', 'activatedAt', 'rolledBackAt', 'rollbackReason']);
  return Object.keys(expected).filter((key) => !ignored.has(key) && !sameG8V2ActivationData(selector[key], expected[key] ?? null));
}

/** Reads the selector first, then only the exact certified active paths for a
 * valid v2 state. It never writes or scans active collections. */
export async function auditG8V2ActivationState(store: G8V2ActivationAuditStore, plan: G8V2ActivationPlan, auditReceipt: string): Promise<G8V2StateAuditResult> {
  const selector = await store.get(plan.manifestPath);
  const base = { auditReceipt, readsPerformed: { selector: 1, expectedActivePaths: 0, total: 1, selectorReadFirst: true }, selector: { state: 'absent' as G8V2StateAuditSelectorState, contract: null as string | null, metadata: { status: 'not-applicable' as const, conflictingFields: 0 } }, contentAudit: null, safeNextAction: '' };
  if (!selector) return { ...base, safeNextAction: safeNextActionFor(base.selector.state, base.contentAudit) };

  const contract = typeof selector.contract === 'string' ? selector.contract : null;
  if (contract !== plan.contract) {
    return { ...base, selector: { ...base.selector, state: contract ? 'legacy' : 'incompatible', contract }, safeNextAction: safeNextActionFor(contract ? 'legacy' : 'incompatible', null) };
  }
  const rawState = selector.state;
  if (!isV2State(rawState)) {
    return { ...base, selector: { ...base.selector, state: 'malformed', contract }, safeNextAction: safeNextActionFor('malformed', null) };
  }

  const expectedSelector = expectedSelectorFor(plan, rawState);
  const conflicts = selectorMetadataConflicts(selector, expectedSelector);
  const content = { expected: plan.documents.length, exact: 0, missing: 0, conflicting: 0 };
  for (const document of plan.documents) {
    const actual = await store.get(document.path);
    if (!actual) content.missing += 1;
    else if (sameG8V2ActivationData(actual, document.data)) content.exact += 1;
    else content.conflicting += 1;
  }
  const state: G8V2StateAuditSelectorState = conflicts.length > 0 || content.conflicting > 0 ? 'conflict' : rawState;
  const result = { ...base, readsPerformed: { selector: 1, expectedActivePaths: content.expected, total: content.expected + 1, selectorReadFirst: true }, selector: { state, contract, metadata: { status: conflicts.length ? 'conflicting' as const : 'matching' as const, conflictingFields: conflicts.length } }, contentAudit: content };
  return { ...result, safeNextAction: safeNextActionFor(state, content) };
}
