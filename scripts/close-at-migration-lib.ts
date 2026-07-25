export const CANONICAL_PROJECT_ID = 'politipiks';
export const CANONICAL_DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';
export const MAX_WRITE_BATCH_SIZE = 400;

export type MigrationRequest = {
  apply: boolean;
  configured: boolean;
  projectId?: string;
  databaseId?: string;
  expectedCount?: number;
  deadline?: Date;
};

export type MigrationRecord = {
  collection: 'races' | 'ballotMeasures';
  id: string;
  closeAt: unknown;
};

export type MigrationPlan = {
  ok: boolean;
  deadline: string;
  expectedCount: number;
  scannedCount: number;
  pending: MigrationRecord[];
  alreadyAtDeadline: MigrationRecord[];
  conflicts: Array<{ collection: string; id: string; closeAtMillis?: number; reason: string }>;
  errors: string[];
  batches: MigrationRecord[][];
};

function valueFor(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function requireValue(args: string[], flag: string) {
  const value = valueFor(args, flag);
  if (!value || value.startsWith('--')) throw new Error(`Migration requires ${flag}.`);
  return value;
}

export function parseUtcDeadline(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('Migration deadline must be an explicit UTC ISO timestamp with milliseconds (for example 2026-11-03T23:59:59.000Z).');
  }
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime()) || deadline.toISOString() !== value) {
    throw new Error('Migration deadline is not a valid UTC ISO timestamp.');
  }
  return deadline;
}

export function parseMigrationRequest(args: string[]): MigrationRequest {
  const knownFlags = new Set(['--apply', '--project-id', '--database-id', '--expected-count', '--deadline']);
  for (const value of args) {
    if (value.startsWith('--') && !knownFlags.has(value)) throw new Error(`Unknown migration option: ${value}`);
  }

  const apply = args.includes('--apply');
  if (args.length === 0) return { apply: false, configured: false };

  const projectId = requireValue(args, '--project-id');
  const databaseId = requireValue(args, '--database-id');
  const expectedCountText = requireValue(args, '--expected-count');
  const deadlineText = requireValue(args, '--deadline');
  const expectedCount = Number(expectedCountText);

  if (projectId !== CANONICAL_PROJECT_ID) throw new Error(`Migration project id must be ${CANONICAL_PROJECT_ID}.`);
  if (databaseId !== CANONICAL_DATABASE_ID) throw new Error(`Migration database id must be ${CANONICAL_DATABASE_ID}.`);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) throw new Error('Migration expected count must be a non-negative integer.');

  return {
    apply,
    configured: true,
    projectId,
    databaseId,
    expectedCount,
    deadline: parseUtcDeadline(deadlineText),
  };
}

function timestampMillis(value: unknown) {
  if (!value || typeof value !== 'object' || !('toMillis' in value) || typeof value.toMillis !== 'function') return null;
  const milliseconds = value.toMillis();
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function buildMigrationPlan(records: MigrationRecord[], request: Required<Pick<MigrationRequest, 'expectedCount' | 'deadline'>>): MigrationPlan {
  const pending: MigrationRecord[] = [];
  const alreadyAtDeadline: MigrationRecord[] = [];
  const conflicts: MigrationPlan['conflicts'] = [];
  const errors: string[] = [];
  const deadlineMillis = request.deadline.getTime();

  for (const record of records) {
    if (!['races', 'ballotMeasures'].includes(record.collection) || !record.id) {
      errors.push(`Invalid migration record: ${record.collection}/${record.id}.`);
      continue;
    }
    if (record.closeAt == null) {
      pending.push(record);
      continue;
    }
    const existingMillis = timestampMillis(record.closeAt);
    if (existingMillis == null) {
      conflicts.push({ collection: record.collection, id: record.id, reason: 'closeAt is not a Firestore Timestamp' });
    } else if (existingMillis === deadlineMillis) {
      alreadyAtDeadline.push(record);
    } else {
      conflicts.push({ collection: record.collection, id: record.id, closeAtMillis: existingMillis, reason: 'conflicting closeAt value' });
    }
  }

  if (pending.length !== request.expectedCount) {
    errors.push(`Expected ${request.expectedCount} documents without closeAt, found ${pending.length}.`);
  }
  if (conflicts.length > 0) errors.push(`Found ${conflicts.length} documents with conflicting closeAt values.`);

  return {
    ok: errors.length === 0,
    deadline: request.deadline.toISOString(),
    expectedCount: request.expectedCount,
    scannedCount: records.length,
    pending,
    alreadyAtDeadline,
    conflicts,
    errors,
    batches: chunk(pending, MAX_WRITE_BATCH_SIZE),
  };
}
