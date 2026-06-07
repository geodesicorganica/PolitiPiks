import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'politipiks-league-flow-test';
const leagueId = 'league-fixture';
const raceId = 'race-fixture';
const alicePickId = 'alice-race-fixture';
const bobPickId = 'bob-race-fixture';
const missingPickId = 'league-fixture_bob_measure-fixture_missing';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
  },
});

async function seedFixtures() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'admins/admin'), { role: 'admin' });
    await setDoc(doc(db, 'races', raceId), {
      state: 'TX',
      office: 'Senate',
      closeDate: '2024-11-05',
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      winnerId: 'candidate-red',
      candidates: [
        { id: 'candidate-blue', name: 'Taylor Blue', party: 'Democrat' },
        { id: 'candidate-red', name: 'Jordan Red', party: 'Republican' },
      ],
    });
    await setDoc(doc(db, 'ballotMeasures', 'measure-fixture'), {
      state: 'TX',
      title: 'Proposition Fixture',
      description: 'Fixture measure',
      closeDate: '2024-11-05',
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      result: 'pass',
    });
  });
}

try {
  await testEnv.clearFirestore();
  await seedFixtures();

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  const caraDb = testEnv.authenticatedContext('cara').firestore();
  const adminDb = testEnv.authenticatedContext('admin').firestore();

  await assertSucceeds(setDoc(doc(aliceDb, 'leagues', leagueId), {
    name: 'Fixture League',
    ownerId: 'alice',
    inviteCode: 'ABC123',
    simulationStatus: 'open',
    contestMode: 'sandbox',
    contestYear: 2024,
    createdAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(aliceDb, 'leagues', leagueId, 'members', 'alice'), {
    userId: 'alice',
    displayName: 'Alice',
    photoURL: '',
    points: 0,
    joinedAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(bobDb, 'leagues', leagueId, 'members', 'bob'), {
    userId: 'bob',
    displayName: 'Bob',
    photoURL: '',
    points: 0,
    joinedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(caraDb, 'leagues', leagueId, 'members', 'bob'), {
    userId: 'bob',
    displayName: 'Cara As Bob',
    photoURL: '',
    points: 0,
    joinedAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(aliceDb, 'predictions', alicePickId), {
    userId: 'alice',
    leagueId,
    targetId: raceId,
    type: 'race',
    pick: 'candidate-blue',
    status: 'pending',
    createdAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(bobDb, 'predictions', bobPickId), {
    userId: 'bob',
    leagueId,
    targetId: raceId,
    type: 'race',
    pick: 'candidate-red',
    status: 'pending',
    createdAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(caraDb, 'predictions', 'cara-race-fixture'), {
    userId: 'cara',
    leagueId,
    targetId: raceId,
    type: 'race',
    pick: 'candidate-red',
    status: 'pending',
    createdAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(aliceDb, 'predictions', alicePickId), {
    pick: 'candidate-red',
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'predictions', alicePickId), {
    status: 'correct',
    score: 1,
    correctPick: 'candidate-red',
    scoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'predictions', bobPickId), {
    status: 'correct',
    score: 1,
    correctPick: 'candidate-red',
    scoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(setDoc(doc(adminDb, 'predictions', missingPickId), {
    userId: 'bob',
    leagueId,
    targetId: 'measure-fixture',
    type: 'measure',
    status: 'missing',
    score: 0,
    correctPick: 'pass',
    createdAt: serverTimestamp(),
    scoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', leagueId, 'members', 'alice'), {
    points: 1,
    correctPicks: 1,
    incorrectPicks: 0,
    missingPicks: 0,
    completedPicks: 1,
    totalEligiblePicks: 2,
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', leagueId, 'members', 'bob'), {
    points: 1,
    correctPicks: 1,
    incorrectPicks: 0,
    missingPicks: 1,
    completedPicks: 1,
    totalEligiblePicks: 2,
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', leagueId), {
    simulationStatus: 'simulated',
    simulatedAt: serverTimestamp(),
    simulatedBy: 'admin',
    eligibleContestCount: 2,
    totalScoredPicks: 4,
    totalMissingPicks: 1,
  }));

  await assertFails(updateDoc(doc(aliceDb, 'predictions', alicePickId), {
    pick: 'candidate-blue',
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(getDoc(doc(bobDb, 'predictions', alicePickId)));

  await assertSucceeds(updateDoc(doc(adminDb, 'predictions', alicePickId), {
    status: 'pending',
    score: deleteField(),
    correctPick: deleteField(),
    scoredAt: deleteField(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'predictions', bobPickId), {
    status: 'pending',
    score: deleteField(),
    correctPick: deleteField(),
    scoredAt: deleteField(),
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(deleteDoc(doc(adminDb, 'predictions', missingPickId)));

  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', leagueId, 'members', 'alice'), {
    points: 0,
    correctPicks: 0,
    incorrectPicks: 0,
    missingPicks: 0,
    completedPicks: 0,
    totalEligiblePicks: 2,
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', leagueId), {
    simulationStatus: 'open',
    resetAt: serverTimestamp(),
    resetBy: 'admin',
    totalScoredPicks: 0,
    totalMissingPicks: 0,
  }));

  await assertSucceeds(updateDoc(doc(aliceDb, 'predictions', alicePickId), {
    pick: 'candidate-blue',
    updatedAt: serverTimestamp(),
  }));

  const missingAfterReset = await getDoc(doc(adminDb, 'predictions', missingPickId));
  assert(!missingAfterReset.exists(), 'reset should delete synthetic missing-pick prediction records');

  console.log('Firestore emulator league flow passed: create, join, pick, simulate lock, reveal, reset, and reopen.');
} finally {
  await testEnv.cleanup();
}
