import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildG8V2StateAuditProductionArguments } from './g8V2StateAuditPreflight.js';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, getCurrentG8V2StateAuditImplementationCommit } from './g8V2ActivationCli.js';
import { validateG8V2StateAuditEnvironment } from './g8V2StateAuditEnvironment.js';
import { runG8V2StructuredAudit } from './g8V2StructuredAuditRunner.js';
import { launchG8V2JsonChild } from './g8V2StateAuditPreflight.js';

const generated = buildG8V2StateAuditProductionArguments({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json', bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json', shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(), stateAuditImplementationCommit: getCurrentG8V2StateAuditImplementationCommit(),
  activationReceipts: { shadowVerification: 'g8-4br3a-shadow', promotion: 'g8-4br3a-promotion', activation: 'g8-4br3a-activation', rollback: 'g8-4br3a-rollback' }, auditReceipt: 'g8-4br3a-audit-test',
});
const args = generated.audit.arguments.slice(2);
const safeEnvironment = { credentialPathConfigured: false, credentialPathExists: null, credentialJsonParseable: null, requiredCredentialFieldsValid: null, configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent: false };
const hooks = { loadDotenv: () => {}, validateEnvironment: () => safeEnvironment };
const phases = ['argument-parsing', 'bundle-manifest-validation', 'plan-guard-validation', 'implementation-identity', 'environment-validation', 'firestore-bootstrap', 'selector-read', 'exact-path-reads'] as const;
for (const phase of phases) {
  const secret = `private-key=SECRET phase=${phase} token=SECRET`;
  const failure = await runG8V2StructuredAudit(args, { ...hooks, beforePhase: (current) => { if (current === phase) throw Object.assign(new Error(secret), { auditCode: 'INJECTED_SECRET_FAILURE' }); }, bootstrap: async () => { throw Object.assign(new Error(secret), { auditCode: phase === 'firestore-bootstrap' ? 'PERMISSION_DENIED' : 'INJECTED_SECRET_FAILURE' }); } });
  assert.equal(failure.status, 'failed');
  assert.equal(failure.failedPhase, phase);
  assert.doesNotMatch(JSON.stringify(failure), /SECRET|private-key|token=/);
}

const selectorPermission = await runG8V2StructuredAudit(args, { ...hooks, bootstrap: async () => ({ get: async () => { throw Object.assign(new Error('permission token=SECRET'), { code: 'PERMISSION_DENIED' }); } }) });
assert.equal(selectorPermission.failedPhase, 'selector-read');
assert.equal(selectorPermission.reads.selector.attempted, 1);
assert.equal(selectorPermission.reads.selector.failed, 1);
assert.equal(selectorPermission.reads.exactPaths.notAttempted, 3352);
assert.equal(selectorPermission.error?.code, 'PERMISSION_DENIED');

let contentPlan: any;
const contentFailure = await runG8V2StructuredAudit(args, {
  ...hooks,
  bootstrap: async (plan) => { contentPlan = plan; return { get: async (path) => path === plan.manifestPath ? plan.activeSelector : plan.documents[0].data }; },
  read: async (kind, path, defaultRead) => { if (kind === 'exact-path') throw Object.assign(new Error(`quota token=SECRET path=${path}`), { code: 'RESOURCE_EXHAUSTED' }); return defaultRead(); },
});
assert.ok(contentPlan);
assert.equal(contentFailure.failedPhase, 'exact-path-reads');
assert.equal(contentFailure.reads.exactPaths.attempted, 1);
assert.equal(contentFailure.reads.exactPaths.unknown, 0);
assert.equal(contentFailure.error?.code, 'QUOTA_EXCEEDED');
assert.equal(contentFailure.contentAudit?.exact, 0);
assert.doesNotMatch(JSON.stringify(contentFailure), /SECRET|token=|path=/);

const malformedCredentialDir = mkdtempSync(join(tmpdir(), 'g8-4br3a-'));
const malformedCredentialPath = join(malformedCredentialDir, 'credentials.json');
writeFileSync(malformedCredentialPath, '{"private_key": 7}', 'utf8');
assert.throws(() => validateG8V2StateAuditEnvironment({ projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a' }, { FIREBASE_SERVICE_ACCOUNT: malformedCredentialPath }), (error: any) => error.auditCode === 'CREDENTIAL_FIELDS_INVALID');
assert.throws(() => validateG8V2StateAuditEnvironment({ projectId: 'politipiks', databaseId: 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a' }, { VITE_ENABLE_TEST_AUTH: 'true' }), (error: any) => error.auditCode === 'UNSAFE_ENVIRONMENT_FLAGS');

const malformed = launchG8V2JsonChild(generated.audit, { spawn: () => ({ pid: 7, status: 0, signal: null, error: null, stdout: 'not-json', stderr: 'raw secret token=SECRET' }) as any });
assert.equal(malformed.evidence.outputStatus, 'malformed-json');
assert.equal(malformed.launcherExitStatus, 1);
assert.doesNotMatch(JSON.stringify({ evidence: malformed.evidence }), /SECRET|token=/);
console.log('G8.4BR3A structured audit runner tests passed');
