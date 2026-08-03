import Papa from 'papaparse';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

export type Row = Record<string, string>;

export function normParty(party: string) {
  const p = party.trim().toLowerCase();
  if (p.includes('democrat')) return 'Democrat';
  if (p.includes('republican')) return 'Republican';
  if (p.includes('independent')) return 'Independent';
  return 'Other';
}

export function slugId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';
}

export function candidateKey(name: string) {
  return slugId(name);
}

/**
 * US general election day: the Tuesday after the first Monday in November.
 * Returns an end-of-day UTC ISO timestamp, matching the placeholder-time
 * convention used for closeDate elsewhere in the ingest pipeline (exact poll
 * close times don't matter for pick locking).
 */
export function electionDayFor(year: number): string {
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstMonday = 1 + ((1 - nov1.getUTCDay() + 7) % 7);
  const electionDay = firstMonday + 1;
  return `${year}-11-${String(electionDay).padStart(2, '0')}T23:59:59Z`;
}

/**
 * Normalizes a house district label to a stable composite-key segment:
 * digits zero-padded to 3, 'AL' for recognized at-large/statewide markers,
 * or null when the input can't be confidently classified. Callers should
 * skip (not guess 'AL' for) a null result — defaulting unparseable input to
 * 'AL' causes false matches against states that do have a true at-large seat.
 */
export function normDistrictKey(raw: string | number | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits && Number(digits) > 0) return String(Number(digits)).padStart(3, '0');
  const upper = value.toUpperCase();
  if ((digits && /^0+$/.test(digits)) || upper.includes('STATEWIDE') || upper.includes('AT LARGE') || upper.includes('AT-LARGE') || upper === 'AL') {
    return 'AL';
  }
  return null;
}

export function betterParty(existing: string, next: string) {
  if (existing === 'Other' && next !== 'Other') return next;
  return existing || next;
}

export function stateAbbrev(row: Row) {
  const st = (row['state_po'] || row['state'] || row['state_abbrev'] || '').trim();
  if (!st) throw new Error('Missing state');
  return st.toUpperCase();
}

export function candidateName(row: Row) {
  return (row['candidate'] || row['candidate_name'] || row['cand'] || '').replace(/\s+/g, ' ').trim();
}

export function candidateParty(row: Row) {
  return (row['party_simplified'] || row['party'] || row['party_detailed'] || '').trim();
}

export function district(row: Row) {
  return (row['district'] || '').replace(/\s+/g, ' ').trim();
}

export function office(row: Row) {
  return (row['office'] || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function mode(row: Row) {
  return (row['mode'] || '').trim().toUpperCase();
}

export function parseVotes(raw: string) {
  const normalized = raw.trim().replace(/,/g, '');
  if (!normalized || normalized === '*') return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function isWriteIn(row: Row) {
  const writein = (row['writein'] || '').trim().toLowerCase();
  const candidate = candidateName(row).toLowerCase();
  return writein == 'true' || candidate.includes('write-in') || candidate.includes('write in');
}

export function isNonCandidateChoice(name: string) {
  const normalized = name.replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase();
  return [
    'OVER VOTES',
    'OVERVOTES',
    'UNDER VOTES',
    'UNDERVOTES',
    'TOTAL VOTES CAST',
    'TOTAL VOTES',
    'WRITE IN',
    'WRITE INS',
    'WRITEIN',
  ].includes(normalized);
}

export async function fetchCsv(url: string) {
  const resp = await fetch(url, { headers: { accept: 'text/csv,*/*' } });
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status} for ${url}`);
  const text = await resp.text();
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`);
  return parsed.data.filter((r: Row) => Object.keys(r).length > 0);
}

/** Parse a downloaded MEDSL delimited file without exposing its rows outside
 * the source adapter. The tabular Senate archive is tab-delimited. */
export function parseMedslDelimited(contents: string, delimiter = ',') {
  const parsed = Papa.parse<Row>(contents, { header: true, skipEmptyLines: true, delimiter });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`);
  return parsed.data.filter((row: Row) => Object.keys(row).length > 0);
}

export function closeDateForElection(electionDateISO: string) {
  // For post-cert historical imports, exact poll close times don't matter for pick locking.
  // Use end-of-day UTC as a stable placeholder.
  return `${electionDateISO}T23:59:59Z`;
}

export async function forEachZipCsvRow(url: string, onRow: (row: Row) => void) {
  const resp = await fetch(url, { headers: { accept: 'application/zip,*/*' } });
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status} for ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  await forEachZipCsvBuffer(buffer, onRow);
}

/** Parses an already-fetched MEDSL ZIP. Capture callers use this to checkpoint
 * privacy-projected aggregates rather than retain raw election rows. */
export async function forEachZipCsvBuffer(buffer: Buffer, onRow: (row: Row) => void) {
  const csvStream = extractFirstCsvStreamFromZip(buffer);

  await new Promise<void>((resolve, reject) => {
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: true,
    });

    parser.on('data', (row: Row) => onRow(row));
    parser.on('error', reject);
    parser.on('finish', resolve);
    csvStream.on('error', reject);
    csvStream.pipe(parser);
  });
}

function extractFirstCsvStreamFromZip(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (fileName.toLowerCase().endsWith('.csv')) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Invalid ZIP local file header');
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return Readable.from(compressed);
      if (compressionMethod === 8) return Readable.from(compressed).pipe(createInflateRaw());
      throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  throw new Error('No CSV file found in ZIP');
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid ZIP: missing end of central directory');
}
