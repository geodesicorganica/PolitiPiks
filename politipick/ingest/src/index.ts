import express from 'express';
import { SourcePayloadSchema } from './schema.js';
import { getFirestore, requireEnv, upsertContests } from './firestore.js';

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

  const url = process.env.INGEST_SOURCE_URL;
  if (!url) {
    return res.status(400).json({ ok: false, error: 'Missing INGEST_SOURCE_URL' });
  }

  try {
    const resp = await fetch(url, { headers: { 'accept': 'application/json' } });
    if (!resp.ok) {
      return res.status(502).json({ ok: false, error: `Source fetch failed: ${resp.status}` });
    }
    const json = await resp.json();
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
