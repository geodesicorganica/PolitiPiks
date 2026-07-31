import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import process from "node:process";
import { WAVE_D_STATES, type WaveDState } from "./lib/waveDSourceResolution.js";
import { buildWaveDProviderReport } from "./lib/waveDStateProviders.js";
const privateRoot = resolve(
  process.cwd(),
  ".artifacts",
  "private",
  "canonical-migration",
);
const evidenceRoot = resolve(process.cwd(), "data", "2026", "wave-d-reviewed");
const fixtureRoot = resolve(process.cwd(), "data", "2026", "wave-d-providers");
type Options = {
  states: WaveDState[];
  input: string;
  fixtureDir: string;
  snapshotIn?: string;
  snapshotOut?: string;
  reportOut?: string;
  replay: boolean;
  fetch: boolean;
};
const privatePath = (value: string, flag: string) => {
  const path = resolve(process.cwd(), value),
    child = relative(privateRoot, path);
  if (!child || child.startsWith("..") || !path.endsWith(".json"))
    throw Error(
      `${flag} must be a JSON file beneath .artifacts/private/canonical-migration`,
    );
  return path;
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const iso = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));
function parse(args: string[]): Options {
  const options: Options = {
    states: [...WAVE_D_STATES],
    input: evidenceRoot,
    fixtureDir: fixtureRoot,
    replay: false,
    fetch: false,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--all-wave-d" || flag === "--dry-run") continue;
    if (flag === "--verify-replay") {
      options.replay = true;
      continue;
    }
    if (flag === "--fetch") {
      options.fetch = true;
      continue;
    }
    const value = args[++i];
    if (!value) throw Error(`missing value for ${flag}`);
    if (flag === "--state") {
      const state = value.toUpperCase() as WaveDState;
      if (!WAVE_D_STATES.includes(state))
        throw Error(`unknown Wave D state: ${value}`);
      options.states = [state];
      continue;
    }
    if (flag === "--input") {
      options.input = resolve(process.cwd(), value);
      continue;
    }
    if (flag === "--fixture-dir") {
      options.fixtureDir = resolve(process.cwd(), value);
      continue;
    }
    if (flag === "--snapshot-in") {
      options.snapshotIn = privatePath(value, flag);
      continue;
    }
    if (flag === "--snapshot-out") {
      options.snapshotOut = privatePath(value, flag);
      continue;
    }
    if (flag === "--report-out") {
      options.reportOut = privatePath(value, flag);
      continue;
    }
    throw Error(`unsupported argument: ${flag}`);
  }
  if (options.snapshotIn && options.snapshotOut)
    throw Error("--snapshot-in and --snapshot-out are mutually exclusive");
  for (const output of [options.snapshotOut, options.reportOut])
    if (output && existsSync(output))
      throw Error(`output exists; refusing to overwrite: ${output}`);
  return options;
}
const readEvidence = (root: string) =>
  Object.fromEntries(
    WAVE_D_STATES.map((state) => [
      state,
      JSON.parse(readFileSync(resolve(root, `${state}.json`), "utf8")),
    ]),
  ) as Record<WaveDState, unknown>;
const readFixtures = (root: string) =>
  Object.fromEntries(
    ["AL", "IL", "IA", "MD", "SD", "ME"]
      .filter((state) => existsSync(resolve(root, `${state}.json`)))
      .map((state) => [
        state,
        JSON.parse(readFileSync(resolve(root, `${state}.json`), "utf8")),
      ]),
  );
const writeNew = (path: string, value: unknown) => {
  mkdirSync(privateRoot, { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
};
const readSnapshot = (path: string) => {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !iso(value.capturedAt) ||
    !object(value.evidence) ||
    !object(value.fixtures)
  ) {
    throw Error("invalid Wave D provider snapshot");
  }
  return { evidence: value.evidence, fixtures: value.fixtures };
};
const options = parse(process.argv.slice(2));
const input = options.snapshotIn
  ? readSnapshot(options.snapshotIn)
  : {
      evidence: readEvidence(options.input),
      fixtures: readFixtures(options.fixtureDir),
    };
if (options.snapshotOut)
  writeNew(options.snapshotOut, {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    ...input,
  });
const audit = buildWaveDProviderReport(input.evidence, input.fixtures);
if (options.replay) {
  const replay = buildWaveDProviderReport(input.evidence, input.fixtures);
  if (
    replay.inputDigest !== audit.inputDigest ||
    replay.evidenceDigest !== audit.evidenceDigest ||
    replay.planDigest !== audit.planDigest
  )
    throw Error("non-deterministic Wave D provider replay");
}
const report = {
  operation: audit.operation,
  dryRun: true,
  firebaseInitialized: false,
  state: options.states.length === 1 ? options.states[0] : "all-wave-d",
  inputDigest: audit.inputDigest,
  evidenceDigest: audit.evidenceDigest,
  planDigest: audit.planDigest,
  counts: audit.counts,
  states: Object.fromEntries(
    options.states.map((state) => [state, audit.states[state]]),
  ),
  fetchDiagnostics: options.fetch
    ? {
        skipped:
          "--fetch is accepted for runner compatibility; this offline fixture audit never fetches mutable official endpoints",
      }
    : {},
};
if (options.reportOut) writeNew(options.reportOut, report);
console.log(JSON.stringify(report, null, 2));
