import { Race, BallotMeasure } from '../types';

export const SEED_RACES: Race[] = [
  {
    id: 'race-ga-senate-2026',
    state: 'Georgia',
    office: 'Senate',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    candidates: [
      { id: 'cand-ossoff', name: 'Jon Ossoff', party: 'Democrat' },
      { id: 'cand-raffen', name: 'Brad Raffensperger', party: 'Republican' },
    ]
  },
  {
    id: 'race-mi-gov-2026',
    state: 'Michigan',
    office: 'Governor',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    candidates: [
      { id: 'cand-gilchrist', name: 'Garlin Gilchrist', party: 'Democrat' },
      { id: 'cand-james', name: 'John James', party: 'Republican' },
    ]
  },
  {
    id: 'race-tx-senate-2026',
    state: 'Texas',
    office: 'Senate',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z',
    candidates: [
      { id: 'cand-cornyn', name: 'John Cornyn', party: 'Republican' },
      { id: 'cand-castro', name: 'Joaquín Castro', party: 'Democrat' },
    ]
  }
];

export const SEED_MEASURES: BallotMeasure[] = [
  {
    id: 'measure-fl-legalization',
    state: 'Florida',
    title: 'Amendment 3: Marijuana Legalization',
    description: 'Allows adults 21 years or older to possess, purchase, or use marijuana products and marijuana accessories for personal non-medical consumption.',
    status: 'upcoming',
    closeDate: '2026-11-03T19:00:00Z'
  },
  {
    id: 'measure-ca-housing',
    state: 'California',
    title: 'Prop 15: Affordable Housing Bond',
    description: 'Authorizes $10 billion in bonds to fund affordable housing programs and infrastructure.',
    status: 'upcoming',
    closeDate: '2026-11-03T20:00:00Z'
  }
];
