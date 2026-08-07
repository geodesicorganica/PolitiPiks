import {readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export type HostingArtifactIssue = {file: string; message: string};

const allowedExtensions = new Set([
  '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.png', '.svg', '.webp',
  '.ttf', '.woff', '.woff2',
]);

const excludedPath = /(^|[\\/])(?:\.env(?:\.|$)|credentials?|private|secrets?|node_modules)(?:[\\/]|$)|\.map$/i;
const forbiddenContent: Array<[string, RegExp]> = [
  ['Gemini key reference', /GEMINI_API_KEY/i],
  ['server-only environment access', /process\.env|import\.meta\.env\.(?!BASE_URL|MODE|DEV|PROD|SSR)/i],
  ['browser legacy API route', /\/api\/(?:refresh|enrich-candidate|candidates)/i],
  ['server bundle dependency', /(?:server\.cjs|firebase-admin|@google\/genai)/i],
  ['unsafe emulator or test flag', /(?:FIRESTORE_EMULATOR_HOST|FIREBASE_AUTH_EMULATOR_HOST|VITE_USE_EMULATOR|USE_MOCK_DATA|TEST_MODE|ADMIN_MODE)/i],
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['secret-shaped value', /\b[A-Z][A-Z0-9]*(?:API_KEY|CLIENT_SECRET|PRIVATE_KEY|SERVICE_ACCOUNT(?:_KEY)?|ACCESS_TOKEN)\s*[:=]\s*["'`][^"'`]{8,}/],
];

function filesUnder(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    if (statSync(fullPath).isDirectory()) files.push(...filesUnder(fullPath));
    else files.push(fullPath);
  }
  return files;
}

export function inspectHostingArtifact(root: string): HostingArtifactIssue[] {
  const issues: HostingArtifactIssue[] = [];
  if (!statSafe(root)?.isDirectory()) return [{file: root, message: 'Hosting output directory is missing.'}];
  const files = filesUnder(root);
  if (!files.some((file) => path.basename(file) === 'index.html')) issues.push({file: root, message: 'Hosting output must contain index.html.'});
  for (const file of files) {
    const relative = path.relative(root, file);
    const normalized = relative.replaceAll('\\', '/');
    if (excludedPath.test(normalized)) issues.push({file: normalized, message: 'Excluded private, credential, environment, source-map, or server artifact.'});
    if (!allowedExtensions.has(path.extname(file).toLowerCase())) issues.push({file: normalized, message: 'Non-browser file type in Hosting output.'});
    const content = readFileSync(file, 'utf8');
    for (const [label, pattern] of forbiddenContent) if (pattern.test(content)) issues.push({file: normalized, message: label});
  }
  return issues;
}

function statSafe(file: string) {
  try { return statSync(file); } catch { return null; }
}

export function assertHostingArtifact(root: string): void {
  const issues = inspectHostingArtifact(root);
  if (issues.length > 0) throw new Error(`Unsafe Hosting artifact:\n${issues.map((issue) => `- ${issue.file}: ${issue.message}`).join('\n')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'hosting-dist';
  assertHostingArtifact(root);
  console.log(`Hosting artifact passed: ${root}`);
}
