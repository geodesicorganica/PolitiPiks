import { validateLocalProductBundle, type LocalProductBundle, type LocalProductDocument } from './localProductBundle.js';

type Json = Record<string, unknown>;
export type LocalProductStore = { commit(documents: LocalProductDocument[]): Promise<void> };

export function assertLoopbackEmulatorHost(value: string | undefined): string {
  const host = value?.trim() ?? '';
  const match = /^(localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/.exec(host);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) throw new Error('FIRESTORE_EMULATOR_HOST must be a loopback host and port');
  return host;
}

export function decodeLocalProductValue(value: unknown, timestamp: (seconds: number, nanoseconds: number) => unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeLocalProductValue(item, timestamp));
  if (value !== null && typeof value === 'object') {
    const record = value as Json;
    if (record.__firestoreType === 'timestamp/v1') {
      if (Object.keys(record).sort().join(',') !== '__firestoreType,nanoseconds,seconds' || !Number.isInteger(record.seconds) || !Number.isInteger(record.nanoseconds) || (record.nanoseconds as number) < 0 || (record.nanoseconds as number) >= 1_000_000_000 || (record.nanoseconds as number) % 1_000 !== 0) throw new Error('malformed local-product timestamp tag');
      return timestamp(record.seconds as number, record.nanoseconds as number);
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeLocalProductValue(item, timestamp)]));
  }
  return value;
}

export async function seedLocalProductBundle(store: LocalProductStore, bundleValue: unknown) {
  const bundle: LocalProductBundle = validateLocalProductBundle(bundleValue);
  const chunks = Array.from({ length: Math.ceil(bundle.documents.length / 400) }, (_, index) => bundle.documents.slice(index * 400, (index + 1) * 400));
  for (const chunk of chunks) await store.commit(chunk);
  return { seeded: bundle.documents.length, batches: chunks.length, counts: bundle.counts, bundleDigest: bundle.bundleDigest };
}
