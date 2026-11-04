import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export const sha256 = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
export function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  renameSync(temporary, path);
}
export function sourceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || /[?&](key|api_key|token)=/i.test(value)) throw new Error('invalid public source URL');
  url.hash = '';
  return url.href;
}
export type Task = { state: string; url: string; purpose: string };
type Entry = { url: string; uses: Task[]; status: 'pending' | 'succeeded' | 'blocked' | 'deferred'; attempts: number[]; nextEligible: number; downloaded: boolean; extracted: boolean; reviewed: boolean; imported: boolean; receipt?: Capture; reason?: string };
type Capture = { url: string; retrievedAt: string; status: string; sha256: string; bodyFile: string; bytes: number; httpStatus: number; contentType: string; etag?: string; lastModified?: string };
type State = { version: 1; entries: Record<string, Entry>; hosts: Record<string, { nextEligible: number; rateLimits: number }> };
export class CaptureQueue {
  state: State;
  constructor(public directory: string, public ledger: string, private transport: typeof fetch = fetch, private now = Date.now) {
    mkdirSync(join(directory, 'bodies'), { recursive: true });
    mkdirSync(join(directory, 'versions'), { recursive: true });
    this.state = existsSync(join(directory, 'queue.json')) ? JSON.parse(readFileSync(join(directory, 'queue.json'), 'utf8')) : { version: 1, entries: {}, hosts: {} };
    if (this.state.version !== 1) throw new Error('unsupported capture queue');
  }
  save() { atomicJson(join(this.directory, 'queue.json'), this.state); }
  add(tasks: Task[]) {
    for (const task of tasks) {
      const url = sourceUrl(task.url), key = sha256(url);
      const entry = this.state.entries[key] ??= { url, uses: [], status: 'pending', attempts: [], nextEligible: 0, downloaded: false, extracted: false, reviewed: false, imported: false };
      if (!entry.uses.some(x => x.state === task.state && x.purpose === task.purpose)) entry.uses.push({ ...task, url });
    }
    this.save();
  }
  body(receipt: Capture) {
    if (basename(receipt.bodyFile) !== receipt.bodyFile) throw new Error('unsafe cache path');
    const body = readFileSync(join(this.directory, 'bodies', receipt.bodyFile));
    if (sha256(body) !== receipt.sha256) throw new Error('cached source integrity mismatch');
    return body;
  }
  reuse(directory: string) {
    const receipt = JSON.parse(readFileSync(join(directory, 'capture-receipt.json'), 'utf8'));
    let reused = 0;
    for (const old of receipt.captures) {
      const url = sourceUrl(old.url), entry = this.state.entries[sha256(url)];
      if (!entry || entry.receipt) continue;
      if (old.status !== 'captured_unreviewed') {
        if ([401, 403, 404].includes(old.httpStatus)) {
          entry.status = 'blocked'; entry.reason = `Legacy HTTP ${old.httpStatus}; investigate replacement or explicitly refresh.`;
        }
        continue;
      }
      if (typeof old.bodyFile !== 'string' || basename(old.bodyFile) !== old.bodyFile) throw new Error('unsafe legacy capture path');
      const body = readFileSync(join(directory, old.bodyFile));
      if (sha256(body) !== old.sha256) throw new Error('legacy source integrity mismatch');
      const bodyFile = old.sha256 + '.body', destination = join(this.directory, 'bodies', bodyFile);
      if (!existsSync(destination)) writeFileSync(destination, body, { flag: 'wx' });
      entry.receipt = { ...old, url, bodyFile };
      this.body(entry.receipt!);
      entry.status = 'succeeded'; entry.downloaded = true;
      writeFileSync(join(this.directory, 'versions', randomUUID() + '.json'), JSON.stringify({ ...entry.receipt, reusedFrom: directory }), { flag: 'wx' });
      reused++;
    }
    this.save(); return reused;
  }
  refresh(url: string) {
    const entry = this.state.entries[sha256(sourceUrl(url))];
    if (!entry) throw new Error('refresh URL is not queued');
    if (entry.status === 'blocked' || entry.status === 'succeeded') entry.nextEligible = 0;
    entry.status = 'pending'; // Keep persisted retry budgets and host cooldowns.
    this.save();
  }
  extract(url: string, text: string, extractor: string) {
    const entry = this.state.entries[sha256(sourceUrl(url))];
    if (!entry?.receipt || !extractor.trim()) throw new Error('capture and extractor identity required');
    this.body(entry.receipt);
    const textDigest = sha256(text), file = `${textDigest}.txt`;
    const destination = join(this.directory, 'bodies', file);
    if (!existsSync(destination)) writeFileSync(destination, text, { flag: 'wx' });
    if (sha256(readFileSync(destination)) !== textDigest) throw new Error('extraction cache integrity mismatch');
    const receipt = { url: entry.url, sourceDigest: entry.receipt.sha256, textDigest, file, extractor, extractedAt: new Date(this.now()).toISOString() };
    writeFileSync(join(this.directory, 'versions', randomUUID() + '.extraction.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
    entry.extracted = true; this.save(); return receipt;
  }
  recordReview(url: string, digest: string, review: { reviewer: string; locator: string; reviewedAt: string }, importedInput?: string) {
    const entry = this.state.entries[sha256(sourceUrl(url))];
    if (!entry?.receipt || entry.receipt.sha256 !== digest || !entry.extracted || !review.reviewer || !review.locator || !Number.isFinite(Date.parse(review.reviewedAt))) throw new Error('review requires matching extracted capture and reviewer');
    this.body(entry.receipt);
    this.verifyExtraction(url);
    const receipt = { url: entry.url, sourceDigest: digest, ...review, ...(importedInput ? { importedInputDigest: importedInput } : {}) };
    writeFileSync(join(this.directory, 'versions', randomUUID() + '.review.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
    entry.reviewed = true; entry.imported = Boolean(importedInput); this.save();
  }
  verifyExtraction(url: string) {
    const entry = this.state.entries[sha256(sourceUrl(url))];
    if (!entry?.receipt || !entry.extracted) throw new Error('source has not been extracted');
    this.body(entry.receipt);
    const receipts = readdirSync(join(this.directory, 'versions')).filter(name => name.endsWith('.extraction.json')).map(name => JSON.parse(readFileSync(join(this.directory, 'versions', name), 'utf8'))).filter(r => r.url === entry.url && r.sourceDigest === entry.receipt!.sha256);
    if (!receipts.length) throw new Error('missing extraction receipt');
    for (const receipt of receipts) {
      if (typeof receipt.file !== 'string' || basename(receipt.file) !== receipt.file || !/^[a-f0-9]{64}$/.test(receipt.textDigest) || sha256(readFileSync(join(this.directory, 'bodies', receipt.file))) !== receipt.textDigest) throw new Error('extraction integrity mismatch');
    }
    return receipts;
  }
  async run(select: (entry: Entry) => boolean, maximum: number, waitForPacing = false) {
    let completed = 0;
    // Serial transport deliberately stays below the global concurrency ceiling.
    for (const entry of Object.values(this.state.entries)) {
      if (completed >= maximum) break;
      if (!select(entry) || !['pending', 'deferred'].includes(entry.status)) continue;
      const host = new URL(entry.url).host;
      const policy = this.state.hosts[host] ??= { nextEligible: 0, rateLimits: 0 };
      let now = this.now();
      entry.attempts = entry.attempts.filter(time => now - time < 86400000);
      if (entry.attempts.length >= 4) { entry.status = 'deferred'; entry.nextEligible = entry.attempts[0] + 86400000; this.save(); continue; }
      const delay = Math.max(entry.nextEligible, policy.nextEligible) - now;
      if (delay > 0) {
        if (!waitForPacing || delay > 3000) continue;
        await new Promise(resolve => setTimeout(resolve, delay));
        now = this.now();
        if (Math.max(entry.nextEligible, policy.nextEligible) > now) continue;
      }
      // Persist pacing and the attempt BEFORE entering exception-prone network code.
      entry.attempts.push(now); policy.nextEligible = now + 3000;
      entry.status = 'deferred'; entry.nextEligible = now + 30000;
      this.save();
      appendFileSync(this.ledger, JSON.stringify({ url: entry.url, provider: host, outcome: 'started', timestamp: new Date(now).toISOString(), nextEligible: entry.nextEligible }) + '\n');
      let outcome = 'network_error', status: number | undefined;
      try {
        const headers: Record<string, string> = { 'user-agent': 'PolitiPiks public election source review' };
        if (entry.receipt?.etag) headers['if-none-match'] = entry.receipt.etag;
        if (entry.receipt?.lastModified) headers['if-modified-since'] = entry.receipt.lastModified;
        const response = await this.transport(entry.url, { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) });
        status = response.status;
        if (status === 304 && entry.receipt) {
          this.body(entry.receipt); entry.status = 'succeeded'; outcome = 'not_modified'; policy.rateLimits = 0;
        } else if (response.ok) {
          const chunks: Uint8Array[] = []; let bytes = 0;
          if (Number(response.headers.get('content-length')) > 40 * 1024 * 1024) { await response.body?.cancel(); throw new Error('body_limit'); }
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            bytes += chunk.length; if (bytes > 40 * 1024 * 1024) throw new Error('body_limit'); chunks.push(chunk);
          }
          const body = Buffer.concat(chunks), digest = sha256(body), bodyFile = digest + '.body';
          if (!existsSync(join(this.directory, 'bodies', bodyFile))) writeFileSync(join(this.directory, 'bodies', bodyFile), body, { flag: 'wx' });
          const receipt: Capture = { url: entry.url, retrievedAt: new Date(now).toISOString(), status: 'captured_unreviewed', sha256: digest, bodyFile, bytes, httpStatus: status, contentType: response.headers.get('content-type') ?? '', ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}), ...(response.headers.get('last-modified') ? { lastModified: response.headers.get('last-modified')! } : {}) };
          this.body(receipt);
          writeFileSync(join(this.directory, 'versions', randomUUID() + '.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
          entry.receipt = receipt; entry.status = 'succeeded'; entry.downloaded = true;
          entry.extracted = false; entry.reviewed = false; entry.imported = false;
          policy.rateLimits = 0; outcome = 'downloaded';
        } else {
          await response.body?.cancel();
          outcome = `http_${status}`;
          let redirectTarget: string | undefined;
          if (status >= 300 && status < 400 && response.headers.get('location')) {
            try { redirectTarget = sourceUrl(new URL(response.headers.get('location')!, entry.url).href); } catch { /* Invalid/private redirect URLs are never followed or logged. */ }
          }
          writeFileSync(join(this.directory, 'versions', randomUUID() + '.http.json'), JSON.stringify({ url: entry.url, retrievedAt: new Date(now).toISOString(), status: 'http_error', httpStatus: status, ...(redirectTarget ? { redirectTarget } : {}) }), { flag: 'wx' });
          if (status === 429 || status === 503) {
            policy.rateLimits++;
            const retry = response.headers.get('retry-after');
            const retryTime = retry ? (/^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry)) : NaN;
            if (Number.isFinite(retryTime)) entry.nextEligible = Math.max(entry.nextEligible, retryTime);
            if (policy.rateLimits >= 3) policy.nextEligible = Math.max(policy.nextEligible, now + 600000, entry.nextEligible);
          } else {
            policy.rateLimits = 0;
            if (status < 500) { entry.status = 'blocked'; entry.reason = status >= 300 && status < 400 ? `Review official redirect destination before queueing it.${redirectTarget ? ' Destination: ' + redirectTarget : ''}` : `Investigate HTTP ${status}; no automatic retry.`; }
          }
        }
      } catch (error) {
        outcome = error instanceof Error && error.message === 'body_limit' ? 'body_limit' : 'network_error';
        if (outcome === 'body_limit') { entry.status = 'blocked'; entry.reason = 'Source exceeds bounded body limit.'; }
      } finally {
        if (entry.status === 'deferred') entry.nextEligible = Math.max(entry.nextEligible, this.now() + [30000, 120000, 600000][Math.min(entry.attempts.length - 1, 2)] + Math.floor(Math.random() * 1000));
        policy.nextEligible = Math.max(policy.nextEligible, this.now() + 3000);
        appendFileSync(this.ledger, JSON.stringify({ url: entry.url, provider: host, outcome, status, timestamp: new Date(this.now()).toISOString(), cacheIdentity: entry.receipt?.sha256, nextEligible: entry.nextEligible }) + '\n');
        this.save(); completed++;
      }
    }
    return { completed, counts: Object.values(this.state.entries).reduce((counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] ?? 0) + 1 }), {} as Record<string, number>) };
  }
}
