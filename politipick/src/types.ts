export interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  photoURL?: string;
}

export interface Race {
  id: string;
  state: string;
  office: 'President' | 'Senate' | 'House' | 'Governor';
  district?: string;
  candidates: Candidate[];
  status: 'upcoming' | 'live' | 'called';
  winnerId?: string;
  closeDate: string;
}

export interface BallotMeasure {
  id: string;
  state: string;
  title: string;
  description: string;
  status: 'upcoming' | 'live' | 'called';
  result?: 'pass' | 'fail';
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
