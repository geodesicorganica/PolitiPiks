import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const cwd = resolve('politipick/.remote-source');
const env = { ...process.env };
for (const key of Object.keys(env)) if (/proxy|google_application_credentials|google_cloud_project|gcloud_project|firebase_config|firebase_token/i.test(key)) delete env[key];
env.NO_PROXY = 'localhost,127.0.0.1,::1';
env.GCLOUD_PROJECT = 'demo-ea-2026';
env.FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true';
env.CI = 'true';
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase.js'), 'emulators:exec', '--project', 'demo-ea-2026', '--config', 'scripts/firebase.ea-test.json', '--only', 'firestore', 'node tests/ea-rules.test.mjs'], { cwd, env, windowsHide: true, stdio: 'inherit' });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
