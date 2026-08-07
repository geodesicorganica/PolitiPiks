import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export const PREVIEW_HOST = 'politipiks--g8-3c2-20260807-x6meubc8.web.app';
export const ROUTES = ['/', '/races', '/leagues'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const HASHED_ASSET = /\/assets\/[^/?#]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/i;
const FIRESTORE_WRITE = /(?:\/commit|\/batchwrite|\/write(?:\/|$)|documents:commit|documents:batchwrite)/i;
const FIRESTORE_READ = /(?:\/listen(?:\/|$)|\/runquery(?:\/|$)|\/batchget(?:documents)?(?:\/|$)|\/lookup(?:\/|$))/i;
const AUTH_HOST = /(?:identitytoolkit|securetoken|accounts\.google|oauth)/i;
const GEMINI_HOST_OR_PATH = /(?:generativelanguage|gemini|\/api(?:\/|$)|runtime-server)/i;

export class SmokeFailure extends Error {
  constructor(summary) {
    super('Hosting preview smoke failed.');
    this.name = 'SmokeFailure';
    this.summary = summary;
  }
}

function asOrigin(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error('base-url must be an origin without credentials, query, hash, or path');
  }

  const hostname = url.hostname.toLowerCase();
  const isPreview = hostname === PREVIEW_HOST;
  const isLoopback = LOOPBACK_HOSTS.has(hostname);
  if (!isPreview && !isLoopback) throw new Error('base-url hostname is not authorized');
  if (isPreview && url.protocol !== 'https:') throw new Error('preview base-url must use https');
  if (!isLoopback && url.port && url.port !== '443') throw new Error('preview base-url has an unauthorized port');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('base-url must use http or https');
  return url.origin;
}

export function validateBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('base-url is required');
  try {
    return asOrigin(value.trim());
  } catch (error) {
    if (error instanceof TypeError) throw new Error('base-url must be a valid URL');
    throw error;
  }
}

export function parseArguments(argv = process.argv.slice(2)) {
  let rawBaseUrl = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--base-url') throw new Error(`unsupported argument: ${argument}`);
    if (rawBaseUrl !== null) throw new Error('base-url may be provided only once');
    rawBaseUrl = argv[index + 1];
    if (!rawBaseUrl || rawBaseUrl.startsWith('--')) throw new Error('base-url value is required');
    index += 1;
  }
  return { baseUrl: validateBaseUrl(rawBaseUrl) };
}

export function classifyRequest({ url, method = 'GET' }) {
  const requestUrl = new URL(url);
  const pathname = requestUrl.pathname;
  const lowerUrl = requestUrl.href.toLowerCase();
  const lowerMethod = String(method).toUpperCase();

  if (GEMINI_HOST_OR_PATH.test(lowerUrl)) return { kind: 'forbidden-api-or-runtime', violation: 'api-or-runtime-dependency' };
  if (AUTH_HOST.test(requestUrl.hostname)) return { kind: 'forbidden-auth', violation: 'authentication-request' };
  if (requestUrl.hostname.toLowerCase().endsWith('googleapis.com') && requestUrl.hostname.toLowerCase().includes('firestore')) {
    if (FIRESTORE_WRITE.test(pathname) || (lowerMethod !== 'GET' && /\/documents(?:\/|$)/i.test(pathname) && !FIRESTORE_READ.test(pathname))) {
      return { kind: 'firestore-write', violation: 'firestore-write-endpoint' };
    }
    if (FIRESTORE_READ.test(pathname)) return { kind: 'firestore-read' };
    if (lowerMethod === 'GET' && /\/documents(?:\/|$)/i.test(pathname)) return { kind: 'firestore-read' };
    return { kind: 'firestore-other', violation: 'unexpected-firestore-endpoint' };
  }
  if (pathname === '/' || pathname === '/index.html' || ROUTES.includes(pathname)) return { kind: 'app-document' };
  if (HASHED_ASSET.test(pathname)) return { kind: 'hashed-asset' };
  if (requestUrl.origin === globalThis.__SMOKE_BASE_ORIGIN__) return { kind: 'unexpected-app-request', violation: 'unexpected-app-request' };
  return { kind: 'unexpected-external-request', violation: 'unexpected-external-request' };
}

export function classifyConsoleMessage({ type, text }) {
  return String(type).toLowerCase() === 'error'
    ? { kind: 'console-error', violation: 'console-error' }
    : { kind: 'console-message', text: String(text ?? '') };
}

export function classifyPageError() {
  return { kind: 'page-error', violation: 'page-error' };
}

function emptySummary(baseUrl) {
  return {
    status: 'running',
    baseUrl,
    routes: { requested: [], reloaded: [], rendered: [] },
    assets: { hashedJs: 0, hashedCss: 0, successfulResponses: 0 },
    network: {
      appDocuments: 0,
      hashedAssets: 0,
      firestoreReads: 0,
      apiOrRuntime: 0,
      firestoreWrites: 0,
      authentication: 0,
      unexpected: 0,
    },
    errors: { console: 0, page: 0, navigation: 0 },
    violations: [],
  };
}

function addViolation(summary, violation) {
  if (violation && !summary.violations.includes(violation)) summary.violations.push(violation);
}

function requestDetails(request) {
  return { url: request.url(), method: request.method() };
}

async function verifyRenderedRoute(page, route, response, summary) {
  const status = response?.status?.() ?? 0;
  if (status < 200 || status >= 400) {
    summary.errors.navigation += 1;
    addViolation(summary, 'navigation-response');
    return;
  }
  const root = page.locator('#root');
  await root.waitFor({ state: 'attached', timeout: 10000 });
  const text = await root.textContent();
  if (!text?.includes('POLITIPICK')) {
    summary.errors.navigation += 1;
    addViolation(summary, 'spa-rendering');
    return;
  }
  summary.routes.rendered.push(route);
}

export async function runSmoke({ baseUrl, launchBrowser = (options) => chromium.launch(options) }) {
  const origin = validateBaseUrl(baseUrl);
  const summary = emptySummary(origin);
  const previousOrigin = globalThis.__SMOKE_BASE_ORIGIN__;
  globalThis.__SMOKE_BASE_ORIGIN__ = origin;
  let browser;
  let context;
  let page;

  const onRequest = (request) => {
    const details = requestDetails(request);
    const classified = classifyRequest(details);
    if (classified.kind === 'app-document') summary.network.appDocuments += 1;
    else if (classified.kind === 'hashed-asset') summary.network.hashedAssets += 1;
    else if (classified.kind === 'firestore-read') summary.network.firestoreReads += 1;
    else if (classified.kind === 'firestore-write') {
      summary.network.firestoreWrites += 1;
      addViolation(summary, classified.violation);
    } else if (classified.kind === 'forbidden-api-or-runtime') {
      summary.network.apiOrRuntime += 1;
      addViolation(summary, classified.violation);
    } else if (classified.kind === 'forbidden-auth') {
      summary.network.authentication += 1;
      addViolation(summary, classified.violation);
    } else if (classified.violation) {
      summary.network.unexpected += 1;
      addViolation(summary, classified.violation);
    }
  };
  const onResponse = (response) => {
    const url = response.url();
    const requestUrl = new URL(url);
    if (!HASHED_ASSET.test(requestUrl.pathname)) return;
    const status = response.status();
    if (status < 200 || status >= 300) addViolation(summary, 'asset-response');
    else summary.assets.successfulResponses += 1;
    if (/\.js$/i.test(requestUrl.pathname)) summary.assets.hashedJs = 1;
    if (/\.css$/i.test(requestUrl.pathname)) summary.assets.hashedCss = 1;
  };
  const onConsole = (message) => {
    const classified = classifyConsoleMessage({ type: message.type(), text: message.text() });
    if (classified.violation) {
      summary.errors.console += 1;
      addViolation(summary, classified.violation);
    }
  };
  const onPageError = () => {
    summary.errors.page += 1;
    addViolation(summary, classifyPageError().violation);
  };

  try {
    browser = await launchBrowser({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    for (const route of ROUTES) {
      summary.routes.requested.push(route);
      const target = `${origin}${route}`;
      let response;
      try {
        response = await page.goto(target, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('domcontentloaded');
        await verifyRenderedRoute(page, route, response, summary);
        await page.waitForTimeout(250);
        summary.routes.reloaded.push(route);
        const reloaded = await page.reload({ waitUntil: 'domcontentloaded' });
        await verifyRenderedRoute(page, route, reloaded, summary);
        await page.waitForTimeout(250);
      } catch {
        summary.errors.navigation += 1;
        addViolation(summary, 'navigation-error');
      }
    }

    if (summary.assets.hashedJs !== 1) addViolation(summary, 'missing-hashed-js');
    if (summary.assets.hashedCss !== 1) addViolation(summary, 'missing-hashed-css');
    if (summary.routes.requested.length !== ROUTES.length) addViolation(summary, 'route-count');
    if (summary.routes.reloaded.length !== ROUTES.length) addViolation(summary, 'reload-count');
    if (summary.routes.rendered.length !== ROUTES.length * 2) addViolation(summary, 'render-count');
  } finally {
    try { await page?.close(); } catch { /* close is best effort after primary failure */ }
    try { await context?.close(); } catch { /* close is best effort after primary failure */ }
    try { await browser?.close(); } catch { /* close is best effort after primary failure */ }
    if (previousOrigin === undefined) delete globalThis.__SMOKE_BASE_ORIGIN__;
    else globalThis.__SMOKE_BASE_ORIGIN__ = previousOrigin;
  }

  summary.violations.sort();
  summary.status = summary.violations.length === 0 ? 'passed' : 'failed';
  if (summary.status === 'failed') throw new SmokeFailure(summary);
  return summary;
}

function printSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  try {
    const { baseUrl } = parseArguments();
    printSummary(await runSmoke({ baseUrl }));
  } catch (error) {
    if (error instanceof SmokeFailure) printSummary(error.summary);
    else printSummary({ status: 'failed', violations: ['malformed-arguments'] });
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
