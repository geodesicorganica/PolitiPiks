import { readFileSync } from 'node:fs';
import { CANONICAL_2026_FEDERAL_CONTESTS } from '../ingest/src/federalRegistry.js';
import { auditDeadlineRegistry, deadlineCoverageReport } from './lib/deadlineRegistry.js';

const registry = JSON.parse(readFileSync('data/2026/jurisdiction-deadlines.json', 'utf8')) as { schemaVersion?: unknown; seatAssignments?: unknown };
try {
  console.log(JSON.stringify({ operation: 'offline-v2-deadline-coverage-audit', complete: true, coverage: deadlineCoverageReport(registry) }, null, 2));
} catch (error) {
  let emittedPartial = false;
  try {
    const partial = auditDeadlineRegistry(registry);
    console.log(JSON.stringify({ operation: 'offline-v2-deadline-coverage-audit', complete: false, ...partial, reason: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
    emittedPartial = true;
  } catch { /* Use the envelope-only report below for malformed input. */ }
  if (!emittedPartial) {
  const known = Array.isArray(registry.seatAssignments) ? registry.seatAssignments.filter((value): value is { electionId?: unknown; electionIds?: unknown } => Boolean(value) && typeof value === 'object').flatMap((value) => typeof value.electionId === 'string' ? [value.electionId] : Array.isArray(value.electionIds) ? value.electionIds.filter((id): id is string => typeof id === 'string') : []) : [];
    const unresolvedElectionIds = CANONICAL_2026_FEDERAL_CONTESTS.map((contest) => contest.id).filter((id) => !known.includes(id));
    console.log(JSON.stringify({ operation: 'offline-v2-deadline-coverage-audit', complete: false, resolved: known.length, total: CANONICAL_2026_FEDERAL_CONTESTS.length, unresolvedElectionIds, reason: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}
