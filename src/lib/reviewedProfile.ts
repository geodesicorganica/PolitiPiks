export type ReviewedSource = { url: string; authority: string; reviewedAt: string; kind: string };
export type ReviewedField = { status: 'present' | 'unavailable' | 'not_applicable'; value?: string | string[]; reason?: string; attribution?: string; sources: ReviewedSource[] };
export const PROFILE_LABELS = { biography: 'Biography', positions: 'Stated positions', website: 'Campaign website', photo: 'Photo', finance: 'Campaign finance', service: 'Public service' };
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export const safeSourceUrl = (x: unknown): x is string => { try { const u = new URL(String(x)); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
export function parseReviewedFields(value: unknown, labels: Record<string, string>): Array<{ key: string; label: string; field: ReviewedField | null }> {
  if (!record(value)) return [];
  return Object.entries(labels).map(([key, label]) => {
    const f = value[key];
    if (!record(f) || !['present', 'unavailable', 'not_applicable'].includes(String(f.status)) || !Array.isArray(f.sources) || !f.sources.length) return { key, label, field: null };
    if (!f.sources.every(s => record(s) && safeSourceUrl(s.url) && typeof s.authority === 'string' && typeof s.reviewedAt === 'string' && Number.isFinite(Date.parse(s.reviewedAt)))) return { key, label, field: null };
    const present = typeof f.value === 'string' && f.value.trim() || Array.isArray(f.value) && f.value.length > 0 && f.value.every(x => typeof x === 'string' && x.trim());
    if (f.status === 'present' && (!present || !['candidate_statement', 'government_record'].includes(String(f.attribution)))) return { key, label, field: null };
    if (f.status === 'present' && f.sources.some(s => s.kind === 'campaign') && f.attribution !== 'candidate_statement') return { key, label, field: null };
    if (f.status !== 'present' && (typeof f.reason !== 'string' || !f.reason.trim())) return { key, label, field: null };
    if (f.status === 'present' && ['photo', 'website'].includes(key) && !safeSourceUrl(f.value)) return { key, label, field: null };
    if (key === 'photo' && f.status === 'present' && !f.reason) return { key, label, field: null };
    return { key, label, field: f as unknown as ReviewedField };
  });
}
