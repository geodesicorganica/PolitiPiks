import { spawnSync } from 'node:child_process';
import { buildG8V2StateAuditProductionArguments } from './lib/g8V2StateAuditPreflight.js';
import { CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT } from './lib/g8V2Activation.js';
import { getCurrentG8V2ActivationImplementationCommit, getCurrentG8V2StateAuditImplementationCommit } from './lib/g8V2ActivationCli.js';

const generated = buildG8V2StateAuditProductionArguments({
  manifestPath: 'docs/g8-catalog-beta-release-manifest.json',
  bundlePath: '.artifacts/private/canonical-migration/g7-1-local-product-bundle.json',
  shadowSourceCommit: CERTIFIED_G8_V2_SHADOW_SOURCE_COMMIT,
  activationImplementationCommit: getCurrentG8V2ActivationImplementationCommit(),
  stateAuditImplementationCommit: getCurrentG8V2StateAuditImplementationCommit(),
  activationReceipts: { shadowVerification: 'g8-4b-shadow-verification-2026-08-08', promotion: 'g8-4b-promotion-2026-08-08', activation: 'g8-4b-selector-activation-2026-08-08', rollback: 'g8-4b-conditional-rollback-2026-08-08' },
  auditReceipt: 'g8-4br0-state-audit-2026-08-08',
});
const startedAt = new Date().toISOString();
const executable = generated.audit[0].endsWith('.cmd') ? generated.audit[0] : `${generated.audit[0]}.cmd`;
const child = spawnSync(executable, generated.audit.slice(1), { cwd: process.cwd(), encoding: 'utf8', env: process.env, windowsHide: true });
const exit = child.status ?? (child.error ? 1 : 0);
console.log(JSON.stringify({ phase: 'g8-4br0-production-read-only-audit', startedAt, finishedAt: new Date().toISOString(), invocationCount: 1, exit, stderrPresent: Boolean(child.stderr?.trim()), result: child.stdout?.trim() ? JSON.parse(child.stdout.trim()) : null }, null, 2));
process.exit(exit);
