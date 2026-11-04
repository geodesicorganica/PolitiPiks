import { CanonicalEvidencePanels } from '../components/CanonicalEvidencePanels';

const government = { url: 'https://example.gov/source', authority: 'Fixture public record', kind: 'government', reviewedAt: '2026-09-21T00:00:00Z' };
const campaign = { url: 'https://example.org/campaign', authority: 'Fixture campaign', kind: 'campaign', reviewedAt: '2026-09-21T00:00:00Z' };
const missing = { status: 'unavailable', reason: 'The reviewed source does not publish this field.', sources: [government] };
export function EaProfileBrowserHarness() {
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-6"><h1 className="text-2xl mb-6">Reviewed candidate profile fixture</h1><CanonicalEvidencePanels research={{ profile: {
    biography: { status: 'present', value: 'Public biography from a reviewed source.', attribution: 'government_record', sources: [government] },
    positions: { status: 'present', value: ['Campaign-supplied statement, attributed to its author.'], attribution: 'candidate_statement', sources: [campaign] },
    website: { status: 'present', value: 'https://example.org/campaign', attribution: 'candidate_statement', sources: [campaign] },
    photo: missing, finance: missing, service: missing,
  } }} metrics={{ reviewedContext: { historical: missing, turnout: missing, demographics: missing } }} /></main>;
}
