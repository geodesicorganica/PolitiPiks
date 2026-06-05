export interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  photoURL?: string;
  incumbent?: boolean;
}

export type ContestMode = 'sandbox' | 'live';
export type ContestStatus = 'upcoming' | 'live' | 'called';
export type MeasureResult = 'pass' | 'fail';

export interface Race {
  id: string;
  state: string;
  office: 'President' | 'Senate' | 'House' | 'Governor';
  district?: string;
  electionYear?: number;
  mode?: ContestMode;
  candidates: Candidate[];
  status: ContestStatus;
  winnerId?: string;
  closeDate: string;
}

export interface BallotMeasure {
  id: string;
  state: string;
  title: string;
  description: string;
  electionYear?: number;
  mode?: ContestMode;
  status: ContestStatus;
  result?: MeasureResult;
  closeDate: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  totalPoints: number;
  predictionsCount: number;
  correctPredictions: number;
}

export interface League {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  contestMode?: ContestMode;
  contestYear?: number;
  simulationStatus?: 'open' | 'simulated';
  simulatedAt?: string;
  simulatedBy?: string;
  resetAt?: string;
  resetBy?: string;
  eligibleContestCount?: number;
  totalScoredPicks?: number;
  totalMissingPicks?: number;
  createdAt: string;
}

export interface Prediction {
  id: string;
  userId: string;
  leagueId?: string; // Optional if global
  targetId: string; // raceId or measureId
  type: 'race' | 'measure';
  pick?: string; // candidateId or 'pass'/'fail'; absent when a missing pick is recorded.
  status: 'pending' | 'correct' | 'incorrect' | 'missing';
  score?: number;
  correctPick?: string;
  scoredAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LeagueMember {
  userId: string;
  displayName: string;
  photoURL?: string;
  points: number;
  correctPicks?: number;
  incorrectPicks?: number;
  missingPicks?: number;
  completedPicks?: number;
  totalEligiblePicks?: number;
  joinedAt: string;
  updatedAt?: string;
}

export type ResearchSourceType =
  | 'official'
  | 'civic-data'
  | 'campaign'
  | 'legislative'
  | 'news'
  | 'aggregator'
  | 'other';

export interface ResearchSource {
  id?: string;
  label: string;
  url: string;
  type?: ResearchSourceType;
  retrievedAt?: string;
}

export interface ResearchLink {
  label: string;
  url: string;
  sourceId?: string;
}

export interface ResearchSection {
  title: string;
  body?: string;
  bullets?: string[];
  links?: ResearchLink[];
  sourceIds?: string[];
}

export type CandidateResearchBucket =
  | 'identity'
  | 'campaign'
  | 'publicRecord'
  | 'legislativeActivity'
  | 'policyPositions'
  | 'electionsHistory'
  | 'provenance';

export type MeasureResearchBucket =
  | 'summary'
  | 'officialText'
  | 'fiscalEffects'
  | 'supportOpposition'
  | 'legalHistory'
  | 'provenance';

export interface CandidateResearch {
  candidateId: string;
  raceId?: string;
  buckets?: Partial<Record<CandidateResearchBucket, ResearchSection[]>>;
  sources?: ResearchSource[];
  updatedAt?: string;
}

export interface MeasureResearch {
  measureId?: string;
  buckets?: Partial<Record<MeasureResearchBucket, ResearchSection[]>>;
  sources?: ResearchSource[];
  updatedAt?: string;
}
