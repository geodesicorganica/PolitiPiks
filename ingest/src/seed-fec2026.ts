import process from 'node:process';
import { upsertContests, bootstrapFirestoreFromCli, hasFlag } from './firestore.js';
import { loadFecFederalContests } from './sources/fec2026.js';

async function main() {
  const payload = await loadFecFederalContests();

  if (hasFlag('--dry-run')) {
    console.log(
      `[Dry Run] FEC ${process.env.FEC_ELECTION_YEAR ?? 2026} federal contests: races=${payload.races.length} (senate=${payload.races.filter((r) => r.office === 'Senate').length}, house=${payload.races.filter((r) => r.office === 'House').length}).`,
    );
    return;
  }

  const { db, projectId, databaseId } = bootstrapFirestoreFromCli();
  await upsertContests(db, payload);

  console.log(
    `Seeded FEC federal contests: races=${payload.races.length}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
