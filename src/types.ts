export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Other';
export type RefreshStatus = 'stale' | 'queued' | 'running' | 'fresh' | 'partial' | 'failed';
export type VerificationLevel = 'seed' | 'official' | 'derived' | 'ai-enriched';

export interface SourceMetadata {
  source?: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  lastRefreshedAt?: string;
  refreshStatus?: RefreshStatus;
  verificationLevel?: VerificationLevel;
}

export interface Jurisdiction extends SourceMetadata {
  id: string;
  name: string;
  level: 'federal' | 'state' | 'local';
  stateCode?: string;
}

export interface Office extends SourceMetadata {
  id: string;
  title: 'Senate' | 'House' | 'Governor' | 'President';
  jurisdictionId: string;
  chamber?: 'upper' | 'lower' | 'executive';
  district?: string;
}

export interface VoteRecord extends SourceMetadata {
  id: string;
  candidateId: string;
  billId?: string;
  bill: string;
  vote: 'Yea' | 'Nay' | 'Present';
  impact: string;
  url: string;
  date: string;
  chamber?: 'House' | 'Senate';
  congress?: number;
  rollNumber?: number;
}

export interface CandidateActivity extends SourceMetadata {
  id: string;
  candidateId: string;
  type: 'executive_action' | 'sponsored_bill' | 'public_position';
  title: string;
  stance?: 'Support' | 'Lead' | 'Chair' | 'Author';
  impact: string;
  url: string;
  date?: string;
}

export interface Bill extends SourceMetadata {
  id: string;
  title: string;
  congress?: number;
  chamber?: 'House' | 'Senate';
  introducedDate?: string;
  latestActionDate?: string;
  url?: string;
}

export interface RaceStat extends SourceMetadata {
  id: string;
  raceId: string;
  label: string;
  value: number;
  capturedAt: string;
}

export interface DataSource {
  id: string;
  label: string;
  kind: 'official' | 'aggregator' | 'ai';
  baseUrl?: string;
  supports: Array<'candidates' | 'races' | 'ballotMeasures' | 'bills' | 'votes' | 'activities' | 'raceStats'>;
}

export interface RefreshJob {
  id: string;
  status: 'queued' | 'running' | 'partial' | 'complete' | 'failed';
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  counts: {
    candidates: number;
    races: number;
    ballotMeasures: number;
    bills: number;
    votes: number;
    activities: number;
    raceStats: number;
    offices: number;
    jurisdictions: number;
    billsScanned: number;
    recordedVotesDiscovered: number;
    unmatchedVoteRows: number;
  };
  failures: Array<{ source: string; message: string }>;
}

export interface RefreshCursor extends SourceMetadata {
  id: string;
  cursorType: 'bill-discovery';
  lastProcessedAt?: string;
}

export interface Candidate extends SourceMetadata {
  id: string;
  externalIds?: {
    bioguideId?: string;
    fecCandidateId?: string;
    openStatesPersonId?: string;
  };
  officeId?: string;
  name: string;
  aliases?: string[];
  party: Party;
  photoURL?: string;
  summary?: string;
  biography?: string;
  campaignPromises?: string[];
  votes?: VoteRecord[];
  activities?: CandidateActivity[];
  // Legacy field retained for backward compatibility with already-seeded Firestore documents.
  keyVotes?: { bill: string; vote: 'Yea' | 'Nay' | 'Present' | 'Support' | 'Lead' | 'Chair' | 'Author'; impact: string; url: string; date?: string }[];
  ballotpediaUrl?: string;
  websiteUrl?: string;
  metrics?: {
    billsIntroduced: number;
    billsPassed: number;
    votingAttendance: number;
    yearsInOffice: number;
    topContributionSector: string;
  };
  pollingHistory?: { date: string; value: number }[];
  sentimentData?: { category: string; value: number }[];
  lastSynced?: string;
  isCurrentOfficeholder?: boolean;
}

export interface UnmatchedVoteRow extends SourceMetadata {
  id: string;
  chamber: 'House' | 'Senate';
  congress: number;
  rollNumber: number;
  memberName?: string;
  state?: string;
  rawVote?: string;
  normalizedName?: string;
  reason: 'missing_name' | 'unmatched_candidate' | 'unsupported_vote';
  voteUrl: string;
}

export interface Race extends SourceMetadata {
  id: string;
  officeId?: string;
  jurisdictionId?: string;
  state: string;
  office: 'Senate' | 'House' | 'Governor' | 'President';
  district?: string;
  candidates: Candidate[];
  status: 'upcoming' | 'live' | 'called';
  winnerId?: string;
  /** Canonical Firestore timestamp used by rules to lock live predictions. */
  closeAt?: import('firebase/firestore').Timestamp;
  /** Legacy display/migration field; do not use to authorize a pick. */
  closeDate: string;
  electionYear: number;
  mode: 'live' | 'sandbox';
  /** Canonical-catalog metadata; absent records are legacy or non-federal compatibility records. */
  catalogScope?: 'federal' | 'nonfederal';
  registryGeneration?: string;
  summary?: string;
  ballotpediaUrl?: string;
  newsUrl?: string;
}

export interface BallotMeasure extends SourceMetadata {
  id: string;
  externalIds?: {
    ballotpediaMeasureId?: string;
    stateMeasureId?: string;
  };
  jurisdictionId?: string;
  state: string;
  title: string;
  shortTitle?: string;
  description: string;
  status: 'upcoming' | 'live' | 'called';
  qualificationStatus?: 'filed' | 'circulating' | 'qualified' | 'on_ballot' | 'withdrawn' | 'failed';
  result?: 'pass' | 'fail';
  /** Canonical Firestore timestamp used by rules to lock live predictions. */
  closeAt?: import('firebase/firestore').Timestamp;
  /** Legacy display/migration field; do not use to authorize a pick. */
  closeDate: string;
  electionYear: number;
  mode: 'live' | 'sandbox';
  electionDate?: string;
  measureNumber?: string;
  yesVotes?: number;
  noVotes?: number;
  fullTextUrl?: string;
  category?: 'Presidential' | 'Statewide' | 'Local';
  ballotpediaUrl?: string;
  history?: string;
  overview?: string;
  impactMetrics?: { label: string; current: number; projected: number }[];
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
  createdAt: string;
  electionYear: number;
  mode: 'live' | 'sandbox';
}

export interface Prediction {
  id: string;
  userId: string;
  leagueId?: string;
  targetId: string;
  type: 'race' | 'measure';
  pick: string;
  status: 'pending' | 'correct' | 'incorrect';
  createdAt: string;
}

export interface LeagueMember {
  userId: string;
  displayName: string;
  photoURL?: string;
  points: number;
  joinedAt: string;
}
