#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const [inputPath, ...flags] = process.argv.slice(2);
if (!inputPath) { console.error('Usage: node scripts/plan-close-at-migration.mjs <export.json>'); process.exit(1); }
if (flags.length > 0) { console.error('This preflight intentionally never writes to Firestore. Production migration requires separate approval.'); process.exit(2); }
const records = JSON.parse(await readFile(inputPath, 'utf8'));
const missingCloseAt = records.filter((record) => record.electionYear === 2026 && record.mode === 'live' && !record.closeAt);
console.log(JSON.stringify({ recordsScanned: records.length, live2026MissingCloseAt: missingCloseAt.map((record) => record.id), invalidCloseDate: missingCloseAt.filter((record) => Number.isNaN(Date.parse(record.closeDate))).map((record) => record.id), nextStep: 'Review this report, then approve a separately scoped production write if one is needed.' }, null, 2));
