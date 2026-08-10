import { existsSync, readFileSync } from 'node:fs';
import { config } from 'dotenv';

export type G8V2SafeEnvironmentReport = {
  credentialPathConfigured: boolean;
  credentialPathExists: boolean | null;
  credentialJsonParseable: boolean | null;
  requiredCredentialFieldsValid: boolean | null;
  configuredProjectMatches: boolean;
  configuredDatabaseMatches: boolean;
  unsafeFlagsPresent: boolean;
};

export class G8V2StateAuditEnvironmentError extends Error {
  constructor(public readonly auditCode: string, public readonly report: G8V2SafeEnvironmentReport) { super(auditCode); }
}

export function loadG8V2StateAuditDotenv() {
  config({ path: existsSync('.env.local') ? '.env.local' : undefined, override: false, quiet: true });
}

const enabled = (value: string | undefined) => /^(?:1|true|yes|on)$/i.test(value ?? '');

export function validateG8V2StateAuditEnvironment(target: { projectId: string; databaseId: string }, environment: NodeJS.ProcessEnv = process.env): G8V2SafeEnvironmentReport {
  const unsafeFlagsPresent = Boolean(environment.FIRESTORE_EMULATOR_HOST) || ['VITE_USE_FIREBASE_EMULATORS', 'VITE_ENABLE_TEST_AUTH', 'VITE_USE_MOCK_CONTESTS', 'VITE_ALLOW_ADMIN_SEED'].some((name) => enabled(environment[name]));
  const credentialPath = environment.FIREBASE_SERVICE_ACCOUNT ?? environment.GOOGLE_APPLICATION_CREDENTIALS ?? null;
  const report: G8V2SafeEnvironmentReport = {
    credentialPathConfigured: Boolean(credentialPath), credentialPathExists: credentialPath ? existsSync(credentialPath) : null,
    credentialJsonParseable: credentialPath ? false : null, requiredCredentialFieldsValid: credentialPath ? false : null,
    configuredProjectMatches: true, configuredDatabaseMatches: true, unsafeFlagsPresent,
  };
  if (unsafeFlagsPresent) throw new G8V2StateAuditEnvironmentError('UNSAFE_ENVIRONMENT_FLAGS', report);
  if (credentialPath && !report.credentialPathExists) throw new G8V2StateAuditEnvironmentError('CREDENTIAL_PATH_MISSING', report);
  let credentials: Record<string, unknown> | null = null;
  if (credentialPath) {
    try { credentials = JSON.parse(readFileSync(credentialPath, 'utf8')) as Record<string, unknown>; report.credentialJsonParseable = true; } catch { throw new G8V2StateAuditEnvironmentError('CREDENTIAL_JSON_INVALID', report); }
    const validFields = typeof credentials.project_id === 'string' && typeof credentials.client_email === 'string' && typeof credentials.private_key === 'string';
    report.requiredCredentialFieldsValid = validFields;
    if (!validFields) throw new G8V2StateAuditEnvironmentError('CREDENTIAL_FIELDS_INVALID', report);
    if (credentials.project_id !== target.projectId) report.configuredProjectMatches = false;
  }
  if (environment.PROJECT_ID && environment.PROJECT_ID !== target.projectId) report.configuredProjectMatches = false;
  if (environment.FIRESTORE_DATABASE_ID && environment.FIRESTORE_DATABASE_ID !== target.databaseId) report.configuredDatabaseMatches = false;
  if (!report.configuredProjectMatches) throw new G8V2StateAuditEnvironmentError('CONFIGURED_PROJECT_MISMATCH', report);
  if (!report.configuredDatabaseMatches) throw new G8V2StateAuditEnvironmentError('CONFIGURED_DATABASE_MISMATCH', report);
  return report;
}
