import process from 'node:process';
import { upsertContests, bootstrapFirestoreFromCli, getArg, hasFlag } from './firestore.js';
import { loadFecFederalContests } from './sources/fec2026.js';

async function main() {
  const candidateScope = getArg('--candidate-scope');
  if (candidateScope) process.env.FEC_CANDIDATE_SCOPE = candidateScope;
  const states = getArg('--states') ?? getArg('--state');
  if (states) process.env.FEC_STATES = states;
  const payload = await loadFecFederalContests();

  if (hasFlag('--dry-run')) {
    console.log(
      `[Dry Run] FEC ${process.env.FEC_ELECTION_YEAR ?? 2026} federal contests: scope=${process.env.FEC_CANDIDATE_SCOPE ?? 'funded'}, races=${payload.races.length}, candidates=${payload.races.reduce((sum, race) => sum + race.candidates.length, 0)} (senate=${payload.races.filter((r) => r.office === 'Senate').length}, house=${payload.races.filter((r) => r.office === 'House').length}).`,
    );
    return;
  }

  const { db, projectId, databaseId } = bootstrapFirestoreFromCli();
  const reconciliation = await upsertContests(db, payload);
  if (reconciliation.identityConflicts.length > 0) {
    console.warn(JSON.stringify({ warning: 'candidate_identity_migration_required', conflicts: reconciliation.identityConflicts }, null, 2));
  }

  console.log(
    `Seeded FEC federal contests: races=${payload.races.length}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
