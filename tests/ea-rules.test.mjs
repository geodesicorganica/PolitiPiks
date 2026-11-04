import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';

if (!/^127\.0\.0\.1:18086$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('explicit EA loopback emulator required');
const env = await initializeTestEnvironment({ projectId: 'demo-ea-2026', firestore: { host: '127.0.0.1', port: 18086, rules: readFileSync('firestore.rules', 'utf8') } });
const generation = 'canonical-2026-ea-2026-09-21';
const selector = { state: 'active', activeFederalGeneration: generation, activeGubernatorialGeneration: generation, activeMeasureGeneration: generation };
const base = { electionYear: 2026, mode: 'live', closeAt: Timestamp.fromMillis(Date.now() + 3600000), predictionReady: true, eligibleCandidateIds: ['fixture-candidate'], registryGeneration: generation };
const actor = env.authenticatedContext('fixture-user').firestore();
const prediction = (targetId, type = 'race', pick = 'fixture-candidate') => ({ targetId, type, pick, leagueId: 'fixture-league', userId: 'fixture-user', status: 'pending', createdAt: serverTimestamp() });
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'catalogActivations/canonical-2026'), selector);
    await setDoc(doc(db, 'leagues/fixture-league'), { ownerId: 'fixture-user', electionYear: 2026, mode: 'live' });
    await setDoc(doc(db, 'leagues/fixture-league/members/fixture-user'), { userId: 'fixture-user' });
    await setDoc(doc(db, 'races/2026-CA-governor'), { ...base, office: 'Governor', catalogScope: 'gubernatorial' });
    await setDoc(doc(db, 'races/2026-AK-house-al'), { ...base, office: 'House', catalogScope: 'federal' });
    await setDoc(doc(db, 'races/legacy-governor'), { ...base, office: 'Governor', registryGeneration: null });
    await setDoc(doc(db, 'races/closed-governor'), { ...base, office: 'Governor', catalogScope: 'gubernatorial', closeAt: Timestamp.fromMillis(Date.now() - 3600000) });
    await setDoc(doc(db, 'ballotMeasures/2026-CA-proposition-test'), { ...base, catalogScope: 'canonical-2026-measures', eligibleOptions: ['yes', 'no'] });
    await setDoc(doc(db, 'ballotMeasures/alternate-id'), { ...base, catalogScope: 'canonical-2026-measures', eligibleOptions: ['yes', 'no'], registryGeneration: 'canonical-old' });
  });
  await assertSucceeds(setDoc(doc(actor, 'predictions/governor'), prediction('2026-CA-governor')));
  await assertSucceeds(setDoc(doc(actor, 'predictions/house'), prediction('2026-AK-house-al')));
  await assertSucceeds(setDoc(doc(actor, 'predictions/measure'), prediction('2026-CA-proposition-test', 'measure', 'yes')));
  await assertFails(setDoc(doc(actor, 'predictions/unlisted'), prediction('2026-CA-governor', 'race', 'not-on-ballot')));
  await assertFails(setDoc(doc(actor, 'predictions/legacy'), prediction('legacy-governor')));
  await assertFails(setDoc(doc(actor, 'predictions/closed'), prediction('closed-governor')));
  await assertFails(setDoc(doc(actor, 'predictions/wrong-generation'), prediction('alternate-id', 'measure', 'yes')));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'predictions/anonymous'), prediction('2026-CA-governor')));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'catalogActivations/canonical-2026'), { ...selector, state: 'pending' }));
  for (const [key, target, type, pick] of [['pending-governor', '2026-CA-governor', 'race', 'fixture-candidate'], ['pending-house', '2026-AK-house-al', 'race', 'fixture-candidate'], ['pending-measure', '2026-CA-proposition-test', 'measure', 'yes']]) {
    await assertFails(setDoc(doc(actor, `predictions/${key}`), prediction(target, type, pick)));
  }
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'catalogActivations/canonical-2026'), selector);
    await updateDoc(doc(ctx.firestore(), 'races/2026-CA-governor'), { eligibleCandidateIds: [], predictionReady: false });
  });
  await assertFails(updateDoc(doc(actor, 'predictions/governor'), { pick: 'fixture-candidate', updatedAt: serverTimestamp() }));
  console.log('EA Firestore rules passed: governors, at-large House, measures, pending, withdrawn, closed, generation mismatch, unauthorized writes');
} finally { await env.cleanup(); }
