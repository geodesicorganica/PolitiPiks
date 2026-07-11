import express from 'express';
import { SourcePayloadSchema } from './schema.js';
import { getFirestore, requireEnv, upsertContests } from './firestore.js';
import { loadMedsl2024StatewideContests } from './sources/medsl2024.js';
import { loadBallotpediaStateElections } from './sources/ballotpedia.js';
import { loadFecFederalContests } from './sources/fec2026.js';

const app = express();
app.use(express.json());

function authOr401(req: express.Request, res: express.Response) {
  const expected = requireEnv('INGEST_TOKEN');
  const got = req.header('X-Ingest-Token');
  if (!got || got !== expected) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/tasks/ingest', async (req, res) => {
  if (!authOr401(req, res)) return;

  const sourceType = (process.env.INGEST_SOURCE_TYPE ?? 'url').toLowerCase();
  const allowMedsl = sourceType === 'medsl2024';
  const allowBallotpedia = sourceType === 'ballotpedia_state';
  const allowFec = sourceType === 'fec';

  const url = process.env.INGEST_SOURCE_URL;
  if (!allowMedsl && !allowBallotpedia && !allowFec && !url) {
    return res.status(400).json({ ok: false, error: 'Missing INGEST_SOURCE_URL' });
  }

  try {
    const json = allowMedsl
      ? await loadMedsl2024StatewideContests()
      : allowFec
        ? await loadFecFederalContests()
        : allowBallotpedia
        ? await (async () => {
            const state = process.env.BALLOTPEDIA_STATE;
            if (!state) throw new Error('Missing BALLOTPEDIA_STATE (e.g. CA)');
            const year = Number(process.env.BALLOTPEDIA_YEAR ?? '2026');
            const officeLevel = (process.env.BALLOTPEDIA_OFFICE_LEVEL ?? 'State') as any;
            return loadBallotpediaStateElections({ state, year, officeLevel });
          })()
        : await (async () => {
            const resp = await fetch(url!, { headers: { accept: 'application/json' } });
            if (!resp.ok) throw new Error(`Source fetch failed: ${resp.status}`);
            return resp.json();
          })();

    const payload = SourcePayloadSchema.parse(json);

    const db = getFirestore();
    await upsertContests(db, payload);

    return res.json({ ok: true, races: payload.races.length, ballotMeasures: payload.ballotMeasures.length });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

const port = Number(process.env.PORT ?? '8080');
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`ingest listening on :${port}`);
});
