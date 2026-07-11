export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Other';
export type RefreshStatus = 'stale' | 'queued' | 'running' | 'fresh' | 'partial' | 'failed';
export type VerificationLevel = 'seed' | 'official' | 'derived' | 'ai-enriched';
export type ContestMode = 'sandbox' | 'live';
export type ContestStatus = 'upcoming' | 'live' | 'called';
export type MeasureResult = 'pass' | 'fail';

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
  incumbent?: boolean;
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
  electionYear?: number;
  mode?: ContestMode;
  candidates: Candidate[];
  status: ContestStatus;
  winnerId?: string;
  closeDate: string;
  summary?: string;
  ballotpediaUrl?: string;
  newsUrl?: string;
  priorResult?: {
    electionYear: number;
    demTwoPartyShare?: number | null;
    repTwoPartyShare?: number | null;
    margin?: number | null;
    winnerCandidateId?: string | null;
  };
  lean?: 'safe_D' | 'likely_D' | 'lean_D' | 'tossup' | 'lean_R' | 'likely_R' | 'safe_R';
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
  electionYear?: number;
  mode?: ContestMode;
  status: ContestStatus;
  qualificationStatus?: 'filed' | 'circulating' | 'qualified' | 'on_ballot' | 'withdrawn' | 'failed';
  result?: MeasureResult;
  closeDate: string;
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
  leagueId?: string;
  targetId: string;
  type: 'race' | 'measure';
  pick?: string;
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

// ---------------------------------------------------------
// PIP-S State Tab Types (NoSQL Entity Models)
// ---------------------------------------------------------

export interface AdvancedTelemetry {
  specialInterestSyndicationScore?: number;
  extraterritorialSpilloverCoefficient?: number;
  topicTitleInversionGap?: number;
  survivalProbability?: number;
  legislativeEffectivenessScore?: number;
  amendingArbitrageIndex?: number;
  caucusCohesionDefianceScore?: number;
  fundingConcentrationHhi?: number;
  outOfDistrictExtractionIndex?: number;
}

export interface PlayerEfficacyMetric {
  playerId: string;
  accuracyScore: number;
  biasIndex: number;
}

export type EntityType = 'POLITICIAN' | 'CORPORATION' | 'PAC' | 'NON_PROFIT' | 'BILL' | 'BALLOT_MEASURE';

export interface NodeEntity {
  id: string;
  name: string;
  entityType: EntityType;
  jurisdictionState: string;
  districtCode?: string;
  createdAt: string;
  telemetry?: AdvancedTelemetry;
  // Bill-specific fields, populated by scripts/ingest-bills.ts (OpenStates).
  identifier?: string; // e.g. "AB 12"
  session?: string;
  openStatesId?: string;
  sourceUrl?: string;
  latestActionAt?: string;
  latestActionDescription?: string;
  tldr?: { whatChanges?: string; whoImpacted?: string };
  fiscalSummary?: { headline?: string; detail?: string };
  updatedAt?: string;
}

/** A bill text version stored at entities/{billNodeId}/versions/{id}. */
export interface BillVersion {
  id: string;
  billNodeId: string;
  label: string; // e.g. "Introduced", "Amended in Assembly"
  date?: string;
  url?: string;
  mediaType?: string;
  /** Extracted plain text, truncated to fit Firestore document limits. */
  text?: string;
  textTruncated?: boolean;
}

/** A scheduled legislative hearing/event, stored in the hearings collection. */
export interface Hearing {
  id: string;
  state: string;
  billId?: string; // display label, e.g. "CA-AB 12"
  billNodeId?: string; // entities/{id} when matched to an ingested bill
  committee: string;
  date: string; // ISO timestamp
  room?: string;
  status: string; // Scheduled | Postponed | Cancelled | ...
}

export type StandardizedStatus = 'INTRODUCED' | 'IN_COMMITTEE' | 'FLOOR_VOTE' | 'CROSS_CHAMBER' | 'EXECUTIVE_ACTION' | 'ENACTED' | 'VETOED';

export interface LegislativeStatusLog {
  id: string;
  billNodeId: string;
  standardizedStatus: StandardizedStatus;
  rawStateStatus: string;
  assignedCommittee?: string;
  changedAt: string;
}

export interface CampaignTransaction {
  id: string;
  donorNodeId: string;
  recipientNodeId: string;
  amount: number;
  transactionDate: string;
  isOutOfDistrict: boolean;
  donorZipCode: string;
  filingReferenceUrl?: string;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  edgeType: 'CITES' | 'TEXTUAL_TWIN' | 'AMENDED_BY' | 'FUNDED_BY' | 'TARGETS_POPULATION' | 'SPONSORED_BY';
  weight?: number;
}

// ---------------------------------------------------------
// ContestResearchBundle Types (v2 Architecture)
// ---------------------------------------------------------

/**
 * Two unit conventions are mixed in this type, matching how producers
 * (e.g. scripts/build-contest-metrics.ts) and the sole heavy consumer
 * (src/components/ResearchDrawer.tsx, via formatPercent/formatSignedPoints/
 * formatSignedPercent) already treat them:
 *
 * - Fractions (0-1): priorVoteShareDem/Rep, turnoutRate, turnoutChange,
 *   demographic shares. Display multiplies by 100 and appends '%'.
 * - Percentage points (already scaled, Dem-positive): priorMargin,
 *   swingVsPrevious, partisanLean, averageMargin, nationalHeadwindTailwind,
 *   economicDirectionIndicator. Display renders the number as-is with a
 *   '+' prefix for positive values.
 *
 * A new field must pick one of these two conventions; use the matching
 * formatter when adding a display for it, not an ad hoc expression.
 */
export interface ContestMetrics {
  id: string;
  raceId: string;
  historical?: {
    priorVoteShareDem?: number | null;
    priorVoteShareRep?: number | null;
    priorMargin?: number | null;
    swingVsPrevious?: number | null;
    partisanLean?: number | null;
  };
  polling?: {
    averageMargin?: number | null;
    pollCount?: number;
    latestPollDate?: string | null;
    fieldDateRange?: { start?: string | null; end?: string | null };
    sampleSizeAggregate?: number | null;
    trend?: 'D_gaining' | 'R_gaining' | 'flat' | null;
    variance?: number | null;
  };
  fundamentals?: {
    incumbencyFlag?: boolean;
    homeStateAdvantageFlag?: boolean;
    nationalHeadwindTailwind?: number | null;
    priorCycleBaseline?: number | null;
    partyContinuity?: boolean;
    economicDirectionIndicator?: number | null;
  };
  turnout?: {
    turnoutRate?: number | null;
    turnoutChange?: number | null;
    earlyVoteShare?: number | null;
  };
  demographics?: {
    racialComposition?: Record<string, number>;
    ageComposition?: Record<string, number>;
    educationComposition?: Record<string, number>;
    urbanRuralShare?: { urban?: number | null; rural?: number | null; };
    incomeProxy?: { medianIncome?: number | null; };
    populationChange?: number | null;
  };
}

export type CandidateResearchCard = {
  candidateId: string;
  name: string;
  party: string;
  incumbency?: 'incumbent' | 'challenger' | 'open-seat' | null;
  identitySummary?: string;
  contestContext?: string | null;
  publicRecordBullets?: string[];
  electionsHistorySummary?: string | null;
  policyPositionsBullets?: string[];
  legislativeActivityBullets?: string[];
  pollingDelta?: number | null;
  fundamentalsAdjustment?: number | null;
  sourceIds: string[];
};

export type HistoricalMetrics = NonNullable<ContestMetrics['historical']>;
export type PollingMetrics = NonNullable<ContestMetrics['polling']>;
export type FundamentalsMetrics = NonNullable<ContestMetrics['fundamentals']>;
export type TurnoutMetrics = NonNullable<ContestMetrics['turnout']>;
export type DemographicMetrics = NonNullable<ContestMetrics['demographics']>;

export type SupportOppositionMetrics = {
  supporters?: string[];
  opponents?: string[];
  summary?: string | null;
};

export type FiscalMetrics = {
  summary: string | null;
};

export type SourceRecord = {
  id: string;
  title: string;
  type: string;
  url?: string | null;
  lastUpdated?: string | null;
  coverageScope?: string;
};

export type FreshnessSummary = {
  lastUpdated?: string | null;
  staleFields: string[];
};

export type ConfidenceSummary = {
  overall: number;
  lowConfidenceFields: string[];
};

export type ContestResearchBundle = {
  contestId: string;
  contestType: 'race' | 'measure';

  meta: {
    title: string;
    officeOrMeasure: string;
    jurisdiction: string;
    electionYear: number;
    mode: 'sandbox' | 'live';
    status: 'upcoming' | 'live' | 'called';
  };

  overview: {
    summary: string;
    source: 'stored' | 'derived' | 'generated' | 'fallback';
  };

  race?: {
    candidates: CandidateResearchCard[];
    historical?: HistoricalMetrics;
    polling?: PollingMetrics;
    fundamentals?: FundamentalsMetrics;
    turnout?: TurnoutMetrics;
    demographics?: DemographicMetrics;
  };

  measure?: {
    summary: string;
    supportOpposition?: SupportOppositionMetrics;
    fiscalEffects?: FiscalMetrics;
    officialTextSummary?: string | null;
    legalHistorySummary?: string | null;
  };

  sources: SourceRecord[];
  freshness: FreshnessSummary;
  confidence: ConfidenceSummary;
  missingFields: string[];
};

