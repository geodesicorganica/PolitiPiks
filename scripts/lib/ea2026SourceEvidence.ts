import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import type { Source } from './ea2026Release.js';

export function verifyEaSourceCaptures(sources: Source[], captures: string) {
  const directory = resolve(captures);
  const versioned = existsSync(join(directory, 'queue.json'));
  const receiptDirectory = versioned ? join(directory, 'versions') : directory;
  const bodyDirectory = versioned ? join(directory, 'bodies') : directory;
  const receipts = readdirSync(receiptDirectory).filter(x => x.endsWith('.json') && x !== 'capture-receipt.json').map(x => JSON.parse(readFileSync(join(receiptDirectory, x), 'utf8')));
  for (const source of sources) {
    const receipt = receipts.find(x => x.url === source.url && x.sha256 === source.sha256 && x.retrievedAt === source.retrievedAt && x.status === 'captured_unreviewed');
    if (!receipt || receipt.retrievedAt !== source.retrievedAt || typeof receipt.bodyFile !== 'string' || basename(receipt.bodyFile) !== receipt.bodyFile) throw new Error('missing matching source capture');
    const bytes = readFileSync(join(bodyDirectory, receipt.bodyFile));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('source capture hash mismatch');
  }
}

export function verifyEaExtraction(directory: string, receipt: { sourceDigest: string; textDigest: string; file: string }) {
  if (!/^[a-f0-9]{64}$/.test(receipt.sourceDigest) || !/^[a-f0-9]{64}$/.test(receipt.textDigest) || basename(receipt.file) !== receipt.file) throw new Error('invalid extraction identity');
  for (const [file, expected] of [[receipt.sourceDigest + '.body', receipt.sourceDigest], [receipt.file, receipt.textDigest]]) {
    if (createHash('sha256').update(readFileSync(join(directory, 'bodies', file))).digest('hex') !== expected) throw new Error('extraction integrity mismatch');
  }
}
