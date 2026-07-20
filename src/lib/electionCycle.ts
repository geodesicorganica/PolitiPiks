import type { Timestamp } from 'firebase/firestore';

export const ACTIVE_ELECTION_YEAR = 2026;
export const ACTIVE_ELECTION_MODE = 'live' as const;

type Closeable = { closeAt?: Timestamp | Date | string | null };

function closeAtDate(closeAt: Closeable['closeAt']): Date | null {
  if (!closeAt) return null;
  const date = typeof closeAt === 'string'
    ? new Date(closeAt)
    : closeAt instanceof Date
      ? closeAt
      : closeAt.toDate();
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPickClosed(target: Closeable, now = new Date()): boolean {
  const closeAt = closeAtDate(target.closeAt);
  return !closeAt || now >= closeAt;
}

export function formatCloseAt(target: Closeable): string {
  const closeAt = closeAtDate(target.closeAt);
  if (!closeAt) return 'Deadline unavailable';
  return closeAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
