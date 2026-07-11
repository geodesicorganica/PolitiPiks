/**
 * Seeds contests from a local JSON file matching SourcePayloadSchema
 * ({ races: [...], ballotMeasures: [...] }). Used for the human-reviewed
 * curated files under data/ (e.g. 2026 governor races and ballot measures
 * drafted by scripts/discover-2026-contests.ts).
 *
 * Usage: npm --prefix ingest run seed:file -- --file ../data/2026/curated-contests.json
 */
import { readFileSync } from 'node:fs';
import { SourcePayloadSchema } from './schema.js';
import { upsertContests, getArg, hasFlag, bootstrapFirestoreFromCli } from './firestore.js';

async function main() {
  const filePath = getArg('--file');
  if (!filePath) throw new Error('Missing --file <path to SourcePayload JSON>');

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const payload = SourcePayloadSchema.parse(raw);

  if (hasFlag('--dry-run')) {
    console.log(`[Dry Run] ${filePath}: races=${payload.races.length}, ballotMeasures=${payload.ballotMeasures.length}. Payload is valid.`);
    return;
  }

  const { db, projectId, databaseId } = bootstrapFirestoreFromCli();
  await upsertContests(db, payload);

  console.log(
    `Seeded contests from ${filePath}: races=${payload.races.length}, ballotMeasures=${payload.ballotMeasures.length}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
