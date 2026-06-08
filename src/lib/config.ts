export function envFlag(name: string, defaultValue = false) {
  const raw = (import.meta as any).env?.[name];
  if (raw == null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

export function envString(name: string, defaultValue = '') {
  const raw = (import.meta as any).env?.[name];
  if (raw == null) return defaultValue;
  return String(raw);
}

export const USE_MOCK_CONTESTS = envFlag('VITE_USE_MOCK_CONTESTS', false);
export const ALLOW_ADMIN_SEED = envFlag('VITE_ALLOW_ADMIN_SEED', false);
export const USE_FIREBASE_EMULATORS = envFlag('VITE_USE_FIREBASE_EMULATORS', false);
export const ENABLE_TEST_AUTH = envFlag('VITE_ENABLE_TEST_AUTH', false);
export const TEST_AUTH_EMAIL = envString('VITE_TEST_AUTH_EMAIL', 'player@example.test');
export const TEST_AUTH_PASSWORD = envString('VITE_TEST_AUTH_PASSWORD', 'politipick-test-password');
export const TEST_AUTH_DISPLAY_NAME = envString('VITE_TEST_AUTH_DISPLAY_NAME', 'Test Player');
