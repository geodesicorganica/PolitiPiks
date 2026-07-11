import { upsertContests, bootstrapFirestoreFromCli } from './firestore.js';
import { loadMedsl2024StatewideContests } from './sources/medsl2024.js';

async function main() {
  const { db, projectId, databaseId } = bootstrapFirestoreFromCli();
  const payload = await loadMedsl2024StatewideContests();
  await upsertContests(db, payload);

  console.log(
    `Seeded MEDSL 2024 contests: races=${payload.races.length}, ballotMeasures=${payload.ballotMeasures.length}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
