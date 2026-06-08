import { expect, test } from '@playwright/test';
import admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const firebaseConfig = JSON.parse(readFileSync(fileURLToPath(new URL('../firebase-applet-config.json', import.meta.url)), 'utf8')) as {
  projectId: string;
  firestoreDatabaseId: string;
};
const firebaseJson = JSON.parse(readFileSync(fileURLToPath(new URL('../firebase.json', import.meta.url)), 'utf8')) as {
  firestore?: Array<{ database?: string }>;
};
const configuredFirestoreDatabaseId = firebaseJson.firestore?.[0]?.database;

if (configuredFirestoreDatabaseId !== firebaseConfig.firestoreDatabaseId) {
  throw new Error(
    `Firestore database mismatch: app uses ${firebaseConfig.firestoreDatabaseId}, firebase.json uses ${configuredFirestoreDatabaseId ?? 'none'}.`,
  );
}

const testUser = {
  email: 'player@example.test',
  password: 'politipick-test-password',
};

const fixture = {
  presidentRaceId: 'e2e-tx-president',
  senateRaceId: 'e2e-tx-senate',
  measureId: 'e2e-tx-measure-1',
  blueCandidateId: 'candidate-blue',
  redCandidateId: 'candidate-red',
};

function db() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('verify-browser-league-flow must run inside the Firestore emulator.');
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
  }

  return getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
}

async function seedFixtureContests() {
  const firestore = db();
  const now = Timestamp.now();

  await Promise.all([
    firestore.collection('races').doc(fixture.presidentRaceId).set({
      state: 'TX',
      office: 'President',
      closeDate: '2024-11-05',
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      winnerId: fixture.blueCandidateId,
      candidates: [
        { id: fixture.blueCandidateId, name: 'Taylor Blue', party: 'Democrat' },
        { id: fixture.redCandidateId, name: 'Jordan Red', party: 'Republican' },
      ],
    }),
    firestore.collection('races').doc(fixture.senateRaceId).set({
      state: 'TX',
      office: 'Senate',
      closeDate: '2024-11-05',
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      winnerId: fixture.redCandidateId,
      candidates: [
        { id: fixture.blueCandidateId, name: 'Casey Blue', party: 'Democrat' },
        { id: fixture.redCandidateId, name: 'Morgan Red', party: 'Republican' },
      ],
    }),
    firestore.collection('ballotMeasures').doc(fixture.measureId).set({
      state: 'TX',
      title: 'Proposition Fixture',
      description: 'Fixture measure for browser flow verification.',
      closeDate: '2024-11-05',
      electionYear: 2024,
      mode: 'sandbox',
      status: 'upcoming',
      result: 'pass',
    }),
    firestore.collection('races').doc(fixture.presidentRaceId).collection('candidateResearch').doc(fixture.blueCandidateId).set({
      candidateId: fixture.blueCandidateId,
      raceId: fixture.presidentRaceId,
      updatedAt: now,
      buckets: {
        identity: [
          {
            title: 'Fixture candidate identity',
            body: 'Taylor Blue is a deterministic candidate used for browser flow verification.',
          },
        ],
      },
      sources: [
        {
          id: 'fixture-source',
          label: 'Fixture Source',
          url: 'https://example.test/fixture-source',
          type: 'official',
          retrievedAt: '2026-06-08T00:00:00.000Z',
        },
      ],
    }),
    firestore.collection('ballotMeasures').doc(fixture.measureId).collection('research').doc('profile').set({
      measureId: fixture.measureId,
      updatedAt: now,
      buckets: {
        summary: [
          {
            title: 'Fixture measure summary',
            body: 'A deterministic measure used for browser flow verification.',
          },
        ],
      },
      sources: [
        {
          id: 'fixture-measure-source',
          label: 'Fixture Measure Source',
          url: 'https://example.test/fixture-measure-source',
          type: 'official',
          retrievedAt: '2026-06-08T00:00:00.000Z',
        },
      ],
    }),
  ]);
}

async function authEmulatorRequest<T>(method: 'accounts:signUp' | 'accounts:signInWithPassword') {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/${method}?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: testUser.email,
      password: testUser.password,
      returnSecureToken: true,
    }),
  });

  return response as Response & { json(): Promise<T> };
}

async function createOrSignInTestUserViaAuthEmulator() {
  const signUpResponse = await authEmulatorRequest<{ localId: string; email: string; error?: { message?: string } }>('accounts:signUp');
  if (signUpResponse.ok) {
    return await signUpResponse.json();
  }

  const signUpError = await signUpResponse.text();
  if (!signUpError.includes('EMAIL_EXISTS')) {
    throw new Error(`Auth emulator sign-up failed: ${signUpResponse.status} ${signUpError}`);
  }

  const response = await authEmulatorRequest<{ localId: string; email: string }>('accounts:signInWithPassword');
  if (!response.ok) {
    throw new Error(`Auth emulator sign-in failed: ${response.status} ${await response.text()}`);
  }

  return await response.json() as { localId: string; email: string };
}

async function grantAdmin(uid: string) {
  await db().collection('admins').doc(uid).set({ role: 'admin', source: 'browser-e2e' });
}

async function findLeagueIdByName(name: string) {
  const firestore = db();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const snapshot = await firestore.collection('leagues').where('name', '==', name).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for league ${name}`);
}

test.beforeAll(async () => {
  await seedFixtureContests();
});

test('league picks can be made, researched, simulated, reset, and edited', async ({ page }) => {
  const leagueName = `Browser E2E ${Date.now()}`;
  const consoleErrors: string[] = [];
  const signedInUser = await createOrSignInTestUserViaAuthEmulator();
  await grantAdmin(signedInUser.localId);

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'POLITIPICK' })).toBeVisible();
  await expect(page.getByTestId('test-sign-in')).toBeVisible();

  await page.getByTestId('test-sign-in').click();
  await expect(page.getByRole('heading', { name: 'Leagues' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible();

  await page.getByTestId('open-create-league').click();
  await page.getByTestId('league-name-input').fill(leagueName);
  await page.getByTestId('launch-league').click();
  await expect(page.getByText('League created successfully.')).toBeVisible();

  const leagueId = await findLeagueIdByName(leagueName);
  await page.getByTestId(`open-league-${leagueId}`).click();
  await expect(page.getByRole('heading', { name: leagueName })).toBeVisible();
  await expect(page.getByText('0/3 Picks Saved')).toBeVisible();

  await page.getByTestId(`race-pick-${fixture.presidentRaceId}-${fixture.blueCandidateId}`).click();
  await expect(page.getByText('Pick saved.')).toBeVisible();
  await expect(page.getByText('1/3 Picks Saved')).toBeVisible();

  await page.getByTestId(`measure-pick-${fixture.measureId}-fail`).click();
  await expect(page.getByText('2/3 Picks Saved')).toBeVisible();

  await page.getByTestId(`research-candidate-${fixture.presidentRaceId}-${fixture.blueCandidateId}`).click();
  await expect(page.getByRole('heading', { name: 'Taylor Blue' })).toBeVisible();
  await expect(page.getByText('Fixture candidate identity')).toBeVisible();
  await page.getByTitle('Close').click();

  await page.getByRole('button', { name: 'Admin' }).click();
  await expect(page.getByText('League Simulation')).toBeVisible();
  await page.getByTestId(`simulate-league-${leagueId}`).click();
  await expect(page.getByText(new RegExp(`Simulated ${leagueName}: 3 contests scored`, 'i'))).toBeVisible();

  await page.getByRole('button', { name: 'Leagues' }).click();
  await page.getByTestId(`open-league-${leagueId}`).click();
  await expect(page.getByText('Simulation complete')).toBeVisible();
  await expect(page.getByText('League Results')).toBeVisible();
  await expect(page.getByText('1 Missing')).toBeVisible();
  await expect(page.getByText('Correct: Taylor Blue')).toBeVisible();
  await expect(page.getByText('Correct: Pass')).toBeVisible();
  await expect(page.getByTestId(`race-pick-${fixture.presidentRaceId}-${fixture.redCandidateId}`)).toBeDisabled();

  await page.getByRole('button', { name: 'Admin' }).click();
  await page.getByTestId(`reset-league-${leagueId}`).click();
  await expect(page.getByText(`Reset ${leagueName}. Picks are open again.`)).toBeVisible();

  await page.getByRole('button', { name: 'Leagues' }).click();
  await page.getByTestId(`open-league-${leagueId}`).click();
  await expect(page.getByText('Pick progress')).toBeVisible();
  await expect(page.getByText('2/3 Picks Saved')).toBeVisible();
  await expect(page.getByTestId(`race-pick-${fixture.presidentRaceId}-${fixture.redCandidateId}`)).toBeEnabled();
  await page.getByTestId(`race-pick-${fixture.presidentRaceId}-${fixture.redCandidateId}`).click();
  await expect(page.getByText('Pick saved.')).toBeVisible();

  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
});
