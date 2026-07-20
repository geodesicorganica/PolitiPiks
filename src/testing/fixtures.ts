import { Timestamp } from 'firebase/firestore';
import type { Race } from '../types';

/**
 * A sandbox-only fixture retained for historical test cases. Production browse
 * queries 2026/live and must never surface this record.
 */
export const RACE_2024_SANDBOX_FIXTURE: Race = {
  id: 'fixture-race-2024-sandbox',
  state: 'Test State',
  office: 'Senate',
  candidates: [],
  status: 'called',
  closeAt: Timestamp.fromDate(new Date('2024-11-05T20:00:00Z')),
  closeDate: '2024-11-05T20:00:00Z',
  electionYear: 2024,
  mode: 'sandbox',
};
