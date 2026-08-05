import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCanonicalPublicationPlan, validateCanonicalPublicationSnapshot } from './lib/canonicalPublication.js';
import { buildHistoricalCvapPlan, validateHistoricalCvapSnapshot } from './lib/historicalCvapDepth.js';
import { validateCongressDepthSnapshot } from './lib/congressDepth.js';
import { validateFecBulkFinanceSnapshot } from './lib/fecBulkFinance.js';
import { projectCertificationValue } from './lib/researchMetricsBaseline.js';

type Json = Record<string, unknown>;
const root = process.cwd();
const read = (relativePath: string) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8')) as unknown;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : isRecord(value)
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');

function pointerPart(value: string) { return value.replaceAll('~', '~0').replaceAll('/', '~1'); }

function differingPointers(left: unknown, right: unknown, limit = 32): string[] {
  const differences: string[] = [];
  const walk = (a: unknown, b: unknown, pointer: string) => {
    if (differences.length >= limit) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) differences.push(`${pointer}/length`);
      for (let index = 0; index < Math.min(a.length, b.length); index += 1) walk(a[index], b[index], `${pointer}/${index}`);
      return;
    }
    if (isRecord(a) && isRecord(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk(a[key], b[key], `${pointer}/${pointerPart(key)}`);
      return;
    }
    if (stable(a) !== stable(b)) differences.push(pointer || '/');
  };
  walk(left, right, '');
  return differences;
}

function classify(pointer: string): 'capture-metadata' | 'ordering' | 'substantive-evidence' | 'code-contract' {
  if (/\/(?:capturedAt|asOf|retrievedAt|sourceCommit|reviewedAt|publishedAt)(?:$|\/)/i.test(pointer) || /\/evidenceDigest$/.test(pointer)) return 'capture-metadata';
  if (/\/\d+\/\d+$/.test(pointer)) return 'ordering';
  if (/digest|plan|evidence/i.test(pointer)) return 'code-contract';
  return 'substantive-evidence';
}

const oldPublication = validateCanonicalPublicationSnapshot(read('.artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json'));
const freshPublication = validateCanonicalPublicationSnapshot(read('.artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json'));
const finance = validateFecBulkFinanceSnapshot(read('.artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json'));
const congress = validateCongressDepthSnapshot(read('.artifacts/private/canonical-migration/g6-3-congress-depth-v2.json'));
const historical = validateHistoricalCvapSnapshot(read('.artifacts/private/canonical-migration/g6-4-historical-cvap-depth.json'));

const oldPublicationPlan = buildCanonicalPublicationPlan(oldPublication.inputs);
const freshPublicationPlan = buildCanonicalPublicationPlan(freshPublication.inputs);
const oldDepthPlan = buildHistoricalCvapPlan(oldPublication, finance, congress, historical);
const freshDepthPlan = buildHistoricalCvapPlan(freshPublication, finance, congress, historical);
const reorderedPublication = {
  ...freshPublication,
  inputs: {
    ...freshPublication.inputs,
    races: [...freshPublication.inputs.races].reverse(),
    deadlines: [...freshPublication.inputs.deadlines].reverse(),
    predictions: [...freshPublication.inputs.predictions].reverse(),
    candidateResearch: [...freshPublication.inputs.candidateResearch].reverse(),
    contestMetrics: [...freshPublication.inputs.contestMetrics].reverse(),
  },
};
const reorderedHistorical = {
  ...historical,
  provenance: { ...historical.provenance, sources: [...historical.provenance.sources].reverse() },
  historical: [...historical.historical].reverse(),
  cvap: [...historical.cvap].reverse(),
};
const reorderedDepthPlan = buildHistoricalCvapPlan(reorderedPublication, finance, congress, reorderedHistorical);
const publicationPointers = differingPointers(oldPublicationPlan.documents, freshPublicationPlan.documents);
const depthPointers = differingPointers(oldDepthPlan.documents, freshDepthPlan.documents, 64);
const semanticDepthPointers = differingPointers(
  projectCertificationValue(oldDepthPlan.documents, oldPublication.capturedAt),
  projectCertificationValue(freshDepthPlan.documents, freshPublication.capturedAt),
);
const classifications = [...new Set(depthPointers.map(classify))];

console.log(JSON.stringify({
  operation: 'diagnose-g6-4-certification-drift',
  firebaseInitialized: false,
  httpCalls: 0,
  validatedPreservedSnapshots: 4,
  comparedDigests: {
    publication: {
      oldInput: oldPublication.inputDigest,
      freshInput: freshPublication.inputDigest,
      oldProjectedDocuments: digest(oldPublicationPlan.documents),
      freshProjectedDocuments: digest(freshPublicationPlan.documents),
      oldPlan: oldPublicationPlan.planDigest,
      freshPlan: freshPublicationPlan.planDigest,
    },
    historical: {
      snapshot: historical.inputDigest,
      source: historical.sourceDigest,
      publicationInput: historical.publicationInputDigest,
      financeInput: historical.financeInputDigest,
      congressInput: historical.congressInputDigest,
      oldDepthInput: oldDepthPlan.inputDigest,
      freshDepthInput: freshDepthPlan.inputDigest,
      oldDepthEvidence: oldDepthPlan.evidenceDigest,
      freshDepthEvidence: freshDepthPlan.evidenceDigest,
      oldDepthPlan: oldDepthPlan.planDigest,
      freshDepthPlan: freshDepthPlan.planDigest,
    },
    priorCertification: {
      expectedEvidence: '7f6e41354136814c13e897e0aef289743379e5da0eb98f14ece33a8036a08ab3',
      observedFreshEvidenceBeforeRemediation: 'efa7cf13bfe1d28b1606ef0042b2b4bc8f87d104baf176d4b29e08ad038f6458',
      expectedPlan: '8e752ba5f0555213d431bb307cc212b47d061fef8c91d7e2ae74e82265d5fe98',
      observedFreshPlanBeforeRemediation: '0eb42235d9f80cc50975779b0d119b47aad0b245fb06717d1b4ae6e2bfcc8bc5',
    },
  },
  semanticPublicationInputsIdentical: JSON.stringify(oldPublication.inputs) === JSON.stringify(freshPublication.inputs),
  completeProjectedPublicationDocumentsIdentical: publicationPointers.length === 0,
  semanticDepthDocumentsIdentical: semanticDepthPointers.length === 0,
  coverage: {
    metrics: oldDepthPlan.historicalCvapCoverage.counts.metrics,
    candidateResearch: oldDepthPlan.historicalCvapCoverage.counts.research,
    measureResearch: oldDepthPlan.historicalCvapCoverage.counts.measures,
    historicalPresent: oldDepthPlan.historicalCvapCoverage.historical.present,
    turnoutPresent: oldDepthPlan.historicalCvapCoverage.turnout.present,
    cvapPresent: oldDepthPlan.historicalCvapCoverage.demographicsCvap.present,
  },
  firstDifferingPublicationJsonPointers: publicationPointers,
  firstDifferingDepthJsonPointers: depthPointers,
  driftClassification: classifications.length === 1 && classifications[0] === 'capture-metadata' ? 'capture-metadata-only' : classifications,
  orderingProbe: {
    evidenceDigestIdentical: reorderedDepthPlan.evidenceDigest === freshDepthPlan.evidenceDigest,
    planDigestIdentical: reorderedDepthPlan.planDigest === freshDepthPlan.planDigest,
  },
  correctedContractStable: oldDepthPlan.evidenceDigest === freshDepthPlan.evidenceDigest && oldDepthPlan.planDigest === freshDepthPlan.planDigest,
}, null, 2));
