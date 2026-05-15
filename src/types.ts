export interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  photoURL?: string;
  summary?: string;
  biography?: string;
  campaignPromises?: string[];
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
}

export interface Race {
  id: string;
  state: string;
  office: 'Senate' | 'House' | 'Governor' | 'President';
  district?: string;
  candidates: Candidate[];
  status: 'upcoming' | 'live' | 'called';
  winnerId?: string;
  closeDate: string;
  summary?: string;
  ballotpediaUrl?: string;
  newsUrl?: string;
}

export interface BallotMeasure {
  id: string;
  state: string;
  title: string;
  description: string;
  status: 'upcoming' | 'live' | 'called';
  result?: 'pass' | 'fail';
  closeDate: string;
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
}

export interface Prediction {
  id: string;
  userId: string;
  leagueId?: string; // Optional if global
  targetId: string; // raceId or measureId
  type: 'race' | 'measure';
  pick: string; // candidateId or 'pass'/'fail'
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
