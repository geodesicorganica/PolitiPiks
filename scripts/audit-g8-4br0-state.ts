import { readFileSync } from 'node:fs';
import { auditG8V2ActivationState } from './lib/g8V2StateAudit.js';
import { buildG8ProductShadowWritePlan } from './lib/g8ProductShadowExecutor.js';
import { buildG8V2ActivationPlan, CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT, createFirestoreG8V2ActivationAuditStore } from './lib/g8V2Activation.js';
import { assertCommittedG8V2Implementation, assertCommittedG8V2StateAuditImplementation, assertG8V2ActivationGuards, parseG8V2ActivationArguments, resolveG8V2Bundle } from './lib/g8V2ActivationCli.js';
import { validateLocalProductBundle } from './lib/localProductBundle.js';

const argv = process.argv.slice(2);
if (!argv.includes('--audit')) throw new Error('supply --audit');
const auditReceiptIndex = argv.indexOf('--audit-receipt');
const auditReceipt = auditReceiptIndex === -1 ? '' : argv[auditReceiptIndex + 1];
const stateAuditCommitIndex = argv.indexOf('--expected-state-audit-implementation-commit');
const stateAuditCommit = stateAuditCommitIndex === -1 ? '' : argv[stateAuditCommitIndex + 1];
if (!auditReceipt || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(auditReceipt)) throw new Error('missing or invalid state audit receipt');
if (!/^[a-f0-9]{7,64}$/i.test(stateAuditCommit)) throw new Error('missing state audit implementation commit');
const parserArguments: string[] = [];
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--audit') continue;
  if (argv[index] === '--audit-receipt' || argv[index] === '--expected-state-audit-implementation-commit') { index += 1; continue; }
  parserArguments.push(argv[index]);
}
const arguments_ = parseG8V2ActivationArguments(parserArguments);
const bundlePath = resolveG8V2Bundle(arguments_.bundleIn!);
const bundle = validateLocalProductBundle(JSON.parse(readFileSync(bundlePath, 'utf8')));
const shadowSourceCommit = arguments_.expectedShadowSourceCommit ?? CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT;
const activationImplementationCommit = arguments_.expectedActivationImplementationCommit ?? '';
const shadowPlan = buildG8ProductShadowWritePlan(bundle, shadowSourceCommit);
const receipts = { shadowVerification: arguments_.shadowVerificationReceipt!, promotion: arguments_.promotionReceipt!, activation: arguments_.activationReceipt!, rollback: arguments_.rollbackReceipt! };
const plan = buildG8V2ActivationPlan(shadowPlan, receipts, { identitySchemaVersion: 2, shadowSourceCommit, activationImplementationCommit });
const manifest = JSON.parse(readFileSync(arguments_.manifest ?? 'docs/g8-catalog-beta-release-manifest.json', 'utf8')) as any;
assertG8V2ActivationGuards(arguments_, plan, manifest);
assertCommittedG8V2Implementation({ identitySchemaVersion: 2, shadowSourceCommit, activationImplementationCommit });
assertCommittedG8V2StateAuditImplementation(stateAuditCommit);
const store = await createFirestoreG8V2ActivationAuditStore(plan);
console.log(JSON.stringify({
  ...await auditG8V2ActivationState(store, plan, auditReceipt),
  identity: { projectId: plan.target.projectId, databaseId: plan.target.databaseId, generation: plan.generation, shadowSourceCommit: plan.shadowSourceCommit, activationImplementationCommit: plan.activationImplementationCommit, stateAuditImplementationCommit: stateAuditCommit, namespaceDigest: plan.certifiedDigests.namespace, planDigest: plan.planDigest, expectedCounts: plan.expectedCounts },
}, null, 2));
