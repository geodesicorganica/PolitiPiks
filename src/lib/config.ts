export function envFlag(name: string, defaultValue = false) {
  const raw = (import.meta as any).env?.[name];
  if (raw == null) return defaultValue;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

export const USE_MOCK_CONTESTS = envFlag('VITE_USE_MOCK_CONTESTS', false);
export const ALLOW_ADMIN_SEED = envFlag('VITE_ALLOW_ADMIN_SEED', false);
