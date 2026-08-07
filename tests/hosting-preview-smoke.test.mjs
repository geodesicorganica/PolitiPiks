import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_HOST,
  ROUTES,
  SmokeFailure,
  classifyConsoleMessage,
  classifyPageError,
  classifyRequest,
  parseArguments,
  runSmoke,
} from '../scripts/hosting-preview-smoke.mjs';

const previewUrl = `https://${PREVIEW_HOST}`;

assert.equal(parseArguments(['--base-url', previewUrl]).baseUrl, previewUrl);
assert.equal(parseArguments(['--base-url', 'http://127.0.0.1:5000']).baseUrl, 'http://127.0.0.1:5000');
assert.throws(() => parseArguments([]), /base-url is required/);
assert.throws(() => parseArguments(['--base-url']), /value is required/);
assert.throws(() => parseArguments(['--base-url', 'https://evil.example']), /not authorized/);
assert.throws(() => parseArguments(['--base-url', 'https://politipiks.web.app']), /not authorized/);
assert.throws(() => parseArguments(['--base-url', `http://${PREVIEW_HOST}`]), /must use https/);
assert.throws(() => parseArguments(['--base-url', previewUrl, '--base-url', previewUrl]), /only once/);
assert.throws(() => parseArguments(['--base-url', previewUrl, '--unknown']), /unsupported argument/);

const source = readFileSync(fileURLToPath(new URL('../scripts/hosting-preview-smoke.mjs', import.meta.url)), 'utf8');
assert.match(source, /from '@playwright\/test'/);
assert.doesNotMatch(source, /\brequire\s*\(/, 'CommonJS require regression detected');

assert.equal(classifyRequest({ url: `${previewUrl}/api/health`, method: 'GET' }).violation, 'api-or-runtime-dependency');
assert.equal(classifyRequest({ url: 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents:commit', method: 'POST' }).violation, 'firestore-write-endpoint');
assert.equal(classifyRequest({ url: 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents/catalogActivations/canonical-2026', method: 'GET' }).kind, 'firestore-read');
assert.equal(classifyRequest({ url: 'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents/catalogActivations/canonical-2026', method: 'POST' }).violation, 'firestore-write-endpoint');
assert.equal(classifyRequest({ url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel', method: 'POST' }).kind, 'firestore-read');
assert.equal(classifyConsoleMessage({ type: 'error', text: 'unexpected' }).violation, 'console-error');
assert.equal(classifyPageError().violation, 'page-error');

class FakeRequest {
  constructor(url, method = 'GET') { this.requestUrl = url; this.requestMethod = method; }
  url() { return this.requestUrl; }
  method() { return this.requestMethod; }
}

class FakeResponse {
  constructor(url, status = 200) { this.responseUrl = url; this.responseStatus = status; }
  url() { return this.responseUrl; }
  status() { return this.responseStatus; }
}

class FakePage {
  constructor({ extraRequest, pageError = false } = {}) {
    this.handlers = new Map();
    this.visited = [];
    this.reloaded = [];
    this.extraRequest = extraRequest;
    this.pageError = pageError;
  }
  on(event, handler) { this.handlers.set(event, handler); }
  emit(event, value) { this.handlers.get(event)?.(value); }
  async goto(url) { return this.navigate(url, false); }
  async reload() { return this.navigate(this.currentUrl, true); }
  async navigate(url, isReload) {
    this.currentUrl = url;
    const pathname = new URL(url).pathname;
    if (isReload) this.reloaded.push(pathname); else this.visited.push(pathname);
    this.emit('request', new FakeRequest(url));
    this.emit('response', new FakeResponse(url));
    if (!isReload) {
      this.emit('request', new FakeRequest(`${new URL(url).origin}/assets/index-Abc1234.js`));
      this.emit('response', new FakeResponse(`${new URL(url).origin}/assets/index-Abc1234.js`));
      this.emit('request', new FakeRequest(`${new URL(url).origin}/assets/index-Def5678.css`));
      this.emit('response', new FakeResponse(`${new URL(url).origin}/assets/index-Def5678.css`));
      if (this.extraRequest) this.emit('request', this.extraRequest);
      if (this.pageError) this.emit('pageerror', new Error('synthetic page error'));
    }
    return new FakeResponse(url);
  }
  async waitForLoadState() {}
  async waitForTimeout() {}
  locator(selector) {
    assert.equal(selector, '#root');
    return { waitFor: async () => {}, textContent: async () => 'POLITIPICK Sign in with Google' };
  }
  async close() {}
}

async function runFake(options = {}) {
  const state = { launches: 0, contexts: 0, pages: 0, page: null };
  const result = await runSmoke({
    baseUrl: 'http://127.0.0.1:5000',
    launchBrowser: async () => {
      state.launches += 1;
      return {
        newContext: async () => {
          state.contexts += 1;
          return {
            newPage: async () => { state.pages += 1; state.page = new FakePage(options); return state.page; },
            close: async () => {},
          };
        },
        close: async () => {},
      };
    },
  });
  return { result, state };
}

const { result, state } = await runFake();
assert.equal(state.launches, 1, 'one browser must be created');
assert.equal(state.contexts, 1, 'one browser context must be created');
assert.equal(state.pages, 1, 'one page must be created');
assert.deepEqual(state.page.visited, ROUTES, 'all required routes must be requested directly');
assert.deepEqual(state.page.reloaded, ROUTES, 'all required routes must be reloaded');
assert.equal(result.status, 'passed');
assert.deepEqual(result.routes.requested, ROUTES);

await assert.rejects(
  runFake({ extraRequest: new FakeRequest('http://127.0.0.1:5000/api/health') }),
  (error) => error instanceof SmokeFailure && error.summary.violations.includes('api-or-runtime-dependency'),
);
await assert.rejects(
  runFake({ extraRequest: new FakeRequest('https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents:commit', 'POST') }),
  (error) => error instanceof SmokeFailure && error.summary.violations.includes('firestore-write-endpoint'),
);
await assert.rejects(
  runFake({ pageError: true }),
  (error) => error instanceof SmokeFailure && error.summary.violations.includes('page-error'),
);

console.log('Hosting preview smoke self-tests passed.');
