import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, updateDoc } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({ projectId: 'politipiks-live-deadline-test', firestore: { rules } });
const userId = 'deadline-test-user';
const now = Date.now();
const openCloseAt = Timestamp.fromMillis(now + 10 * 60 * 1000);
const closedCloseAt = Timestamp.fromMillis(now);
const target = (closeAt) => ({ electionYear: 2026, mode: 'live', closeAt, closeDate: closeAt.toDate().toISOString() });
const prediction = (targetId, type = 'race') => ({ userId, targetId, type, pick: 'candidate-a', status: 'pending', createdAt: Timestamp.fromMillis(now) });

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'races/open-race'), target(openCloseAt));
    await setDoc(doc(adminDb, 'races/closed-race'), target(closedCloseAt));
    await setDoc(doc(adminDb, 'ballotMeasures/open-measure'), target(openCloseAt));
    await setDoc(doc(adminDb, 'ballotMeasures/closed-measure'), target(closedCloseAt));
    await setDoc(doc(adminDb, 'predictions/open-update'), prediction('open-race'));
    await setDoc(doc(adminDb, 'predictions/closed-update'), prediction('closed-race'));
  });
  const userDb = testEnv.authenticatedContext(userId).firestore();
  await assertSucceeds(setDoc(doc(userDb, 'predictions/open-create'), prediction('open-race')));
  await assertSucceeds(updateDoc(doc(userDb, 'predictions/open-update'), { pick: 'candidate-b' }));
  await assertSucceeds(setDoc(doc(userDb, 'predictions/open-measure-create'), prediction('open-measure', 'measure')));
  await assertFails(setDoc(doc(userDb, 'predictions/closed-create'), prediction('closed-race')));
  await assertFails(updateDoc(doc(userDb, 'predictions/closed-update'), { pick: 'candidate-b' }));
  await assertFails(setDoc(doc(userDb, 'predictions/closed-measure-create'), prediction('closed-measure', 'measure')));
  console.log('PASS: before-close create/update allowed; at-or-after-close create/update denied.');
} finally {
  await testEnv.cleanup();
}
