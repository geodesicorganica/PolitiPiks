import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildG8ProductShadowWritePlan } from './g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, type G8V2ActivationAuditStore } from './g8V2Activation.js';
import { auditG8V2ActivationState } from './g8V2StateAudit.js';
import { validateLocalProductBundle } from './localProductBundle.js';

const bundle = validateLocalProductBundle(JSON.parse(readFileSync('.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', 'utf8')));
const shadowPlan = buildG8ProductShadowWritePlan(bundle, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT);
const plan = buildG8V2ActivationPlan(shadowPlan, { shadowVerification: 'g8-4br0-shadow', promotion: 'g8-4br0-promotion', activation: 'g8-4br0-activation', rollback: 'g8-4br0-rollback' }, { identitySchemaVersion: 2, shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, activationImplementationCommit: 'a'.repeat(40) });
class MemoryAuditStore implements G8V2ActivationAuditStore { constructor(readonly docs = new Map<string, Record<string, unknown>>(), readonly reads: string[] = []) {} async get(path: string) { this.reads.push(path); return this.docs.get(path) ?? null; } }

const absent = new MemoryAuditStore();
assert.deepEqual(await auditG8V2ActivationState(absent, plan, 'g8-4br0-state-audit-2026-08-08'), { auditReceipt: 'g8-4br0-state-audit-2026-08-08', readsPerformed: { selector: 1, expectedActivePaths: 0, total: 1, selectorReadFirst: true }, selector: { state: 'absent', contract: null, metadata: { status: 'not-applicable', conflictingFields: 0 } }, contentAudit: null, safeNextAction: 'separately authorize a fresh v2 activation recovery' });
assert.deepEqual(absent.reads, [plan.manifestPath]);
const legacy = new MemoryAuditStore(new Map([[plan.manifestPath, { contract: 'legacy/v1', state: 'active' }]]));
const legacyResult = await auditG8V2ActivationState(legacy, plan, 'receipt');
assert.equal(legacyResult.selector.state, 'legacy');
assert.deepEqual(legacy.reads, [plan.manifestPath]);
const exactDocs = new Map(plan.documents.map((document) => [document.path, document.data]));
exactDocs.set(plan.manifestPath, plan.activeSelector);
const active = new MemoryAuditStore(exactDocs);
const activeResult = await auditG8V2ActivationState(active, plan, 'receipt');
assert.deepEqual(activeResult.contentAudit, { expected: 3352, exact: 3352, missing: 0, conflicting: 0 });
assert.equal(activeResult.selector.state, 'active');
assert.equal(activeResult.safeNextAction, 'separately authorize live smoke verification');
assert.equal(active.reads[0], plan.manifestPath);
assert.equal(active.reads.length, 3353);
const conflictDocs = new Map(exactDocs);
conflictDocs.delete(plan.documents[0].path);
conflictDocs.set(plan.documents[1].path, { changed: true });
const conflict = await auditG8V2ActivationState(new MemoryAuditStore(conflictDocs), plan, 'receipt');
assert.deepEqual(conflict.contentAudit, { expected: 3352, exact: 3350, missing: 1, conflicting: 1 });
assert.equal(conflict.selector.state, 'conflict');
assert.equal(conflict.safeNextAction, 'stop for review');
console.log('G8.4BR0 state audit unit tests passed');
