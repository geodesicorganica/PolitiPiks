import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({ projectId: `politipiks-league-deadline-test-${Date.now()}`, firestore: { rules } });
const userId = 'league-member';
const otherUserId = 'other-member';
const now = Date.now();
const openCloseAt = Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
const closedCloseAt = Timestamp.fromMillis(now - 60 * 60 * 1000);
const canonicalGeneration = 'canonical-2026-shadow-v1';

const target = (closeAt, eligibleCandidateIds = ['candidate-a', 'candidate-b']) => ({ electionYear: 2026, mode: 'live', closeAt, closeDate: closeAt.toDate().toISOString(), eligibleCandidateIds });
const league = (ownerId = userId) => ({
  name: 'Test league',
  ownerId,
  inviteCode: 'TEST26',
  createdAt: Timestamp.fromMillis(now),
  electionYear: 2026,
  mode: 'live',
});
const member = (id, points = 0) => ({
  userId: id,
  displayName: id,
  photoURL: '',
  points,
  joinedAt: Timestamp.fromMillis(now),
});
const prediction = (targetId, overrides = {}) => ({
  userId,
  leagueId: 'league-a',
  targetId,
  type: 'race',
  pick: 'candidate-a',
  status: 'pending',
  createdAt: serverTimestamp(),
  ...overrides,
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'races/open-race'), target(openCloseAt));
    await setDoc(doc(adminDb, 'races/closed-race'), target(closedCloseAt));
    await setDoc(doc(adminDb, 'races/2026-CA-senate'), target(openCloseAt));
    await setDoc(doc(adminDb, 'races/2026-FL-senate'), target(closedCloseAt));
    await setDoc(doc(adminDb, 'races/2026-CA-senate-class-1'), { ...target(openCloseAt, ['fec-canonical', 'fec-canonical-updated']), catalogScope: 'federal', registryGeneration: canonicalGeneration });
    await setDoc(doc(adminDb, 'races/2026-GA-senate-class-2'), { ...target(openCloseAt, []), catalogScope: 'federal', registryGeneration: canonicalGeneration });
    await setDoc(doc(adminDb, 'races/2026-CA-senate-class-1/candidateResearch/fec-canonical'), { raceId: '2026-CA-senate-class-1', candidateId: 'fec-canonical' });
    await setDoc(doc(adminDb, 'contestMetrics/2026-CA-senate-class-1'), { raceId: '2026-CA-senate-class-1' });
    await setDoc(doc(adminDb, 'catalogActivations/canonical-2026'), { state: 'active', activeFederalGeneration: canonicalGeneration });
    await setDoc(doc(adminDb, 'ballotMeasures/open-measure'), target(openCloseAt));
    await setDoc(doc(adminDb, 'ballotMeasures/closed-measure'), target(closedCloseAt));
    await setDoc(doc(adminDb, 'leagues/league-a'), league());
    await setDoc(doc(adminDb, 'leagues/league-b'), league(otherUserId));
    await setDoc(doc(adminDb, `leagues/league-a/members/${userId}`), member(userId));
    await setDoc(doc(adminDb, `leagues/league-a/members/${otherUserId}`), member(otherUserId));
    await setDoc(doc(adminDb, 'predictions/open-update'), prediction('open-race', { createdAt: Timestamp.fromMillis(now) }));
    await setDoc(doc(adminDb, 'predictions/closed-update'), prediction('closed-race', { createdAt: Timestamp.fromMillis(now) }));
    await setDoc(doc(adminDb, 'predictions/cross-league'), prediction('open-race', { leagueId: 'league-b', createdAt: Timestamp.fromMillis(now) }));
  });

  const userDb = testEnv.authenticatedContext(userId).firestore();
  const otherUserDb = testEnv.authenticatedContext(otherUserId).firestore();

  await assertSucceeds(setDoc(doc(userDb, 'predictions/open-create'), prediction('open-race')));
  await assertFails(setDoc(doc(userDb, 'predictions/open-ineligible-candidate'), prediction('open-race', { pick: 'candidate-not-eligible' })));
  await assertSucceeds(setDoc(doc(userDb, 'predictions/canonical-create'), prediction('2026-CA-senate-class-1', { pick: 'fec-canonical' })));
  await assertFails(setDoc(doc(userDb, 'predictions/catalog-only-create'), prediction('2026-GA-senate-class-2', { pick: 'candidate-a' })));
  await assertSucceeds(updateDoc(doc(userDb, 'predictions/canonical-create'), { pick: 'fec-canonical-updated', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/canonical-create'), { pick: 'fec-not-eligible', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(userDb, 'predictions/legacy-federal-create'), prediction('2026-CA-senate')));
  await assertSucceeds(getDocs(query(
    collection(userDb, 'predictions'),
    where('userId', '==', userId),
    where('leagueId', '==', 'league-a'),
  )));
  await assertSucceeds(updateDoc(doc(userDb, 'predictions/open-update'), { pick: 'candidate-b', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(userDb, 'predictions/open-create')));
  await assertSucceeds(setDoc(doc(userDb, 'predictions/open-measure-create'), prediction('open-measure', { type: 'measure', pick: 'pass' })));
  await assertSucceeds(getDoc(doc(userDb, 'races/2026-CA-senate-class-1/candidateResearch/fec-canonical')));
  await assertSucceeds(getDoc(doc(userDb, 'contestMetrics/2026-CA-senate-class-1')));
  await assertFails(setDoc(doc(userDb, 'catalogActivations/canonical-2026'), { state: 'rollback', activeFederalGeneration: 'legacy-2026' }));

  const { leagueId: _missingLeagueId, ...missingLeaguePrediction } = prediction('open-race');
  await assertFails(setDoc(doc(userDb, 'predictions/missing-league'), missingLeaguePrediction));
  await assertFails(setDoc(doc(userDb, 'predictions/non-member'), prediction('open-race', { leagueId: 'league-b' })));
  await assertFails(setDoc(doc(userDb, 'predictions/not-pending'), prediction('open-race', { status: 'correct' })));
  await assertFails(setDoc(doc(userDb, 'predictions/extra-field'), prediction('open-race', { score: 100 })));
  await assertFails(setDoc(doc(userDb, 'predictions/closed-create'), prediction('closed-race')));
  await assertFails(setDoc(doc(userDb, 'predictions/closed-measure-create'), prediction('closed-measure', { type: 'measure', pick: 'pass' })));

  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { userId: otherUserId, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { leagueId: 'league-b', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { targetId: 'closed-race', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { type: 'measure', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { status: 'correct', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, 'predictions/open-update'), { pick: 'candidate-c' }));
  await assertFails(updateDoc(doc(userDb, 'predictions/closed-update'), { pick: 'candidate-b', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(userDb, 'predictions/closed-update')));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'catalogActivations/canonical-2026'), { state: 'rollback', activeFederalGeneration: 'legacy-2026' });
  });
  await assertFails(setDoc(doc(userDb, 'predictions/rollback-closed-legacy'), prediction('2026-FL-senate')));

  await assertFails(getDoc(doc(userDb, 'predictions/cross-league')));
  await assertFails(getDocs(query(
    collection(userDb, 'predictions'),
    where('userId', '==', userId),
    where('leagueId', '==', 'league-b'),
  )));
  await assertFails(getDoc(doc(otherUserDb, 'predictions/open-update')));
  await assertFails(updateDoc(doc(otherUserDb, 'predictions/open-update'), { pick: 'candidate-b', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(userDb, `leagues/league-a/members/${userId}`), { points: 999 }));
  await assertFails(setDoc(doc(userDb, `leagues/league-a/members/new-member`), member('new-member')));
  await assertFails(setDoc(doc(userDb, `leagues/league-a/members/${userId}-tampered`), member(userId, 99)));

  await assertSucceeds(updateDoc(doc(userDb, 'leagues/league-a'), { name: 'Renamed league' }));
  await assertSucceeds(updateDoc(doc(userDb, 'leagues/league-a'), { inviteCode: 'NEW26' }));
  await assertFails(updateDoc(doc(userDb, 'leagues/league-a'), { ownerId: otherUserId }));
  await assertFails(updateDoc(doc(otherUserDb, 'leagues/league-a'), { name: 'Takeover' }));

  console.log('PASS: league-scoped prediction create/update/delete and least-privilege denials verified.');
} finally {
  await testEnv.cleanup();
}
