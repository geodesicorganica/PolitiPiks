import assert from 'node:assert/strict';

const baseUrl = `http://127.0.0.1:${process.env.HOSTING_EMULATOR_PORT || '5000'}`;

async function get(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
  return {response, body: await response.text()};
}

const root = await get('/');
assert.match(root.body, /id=["']root["']/i, 'root did not return the SPA shell');
assert.doesNotMatch(root.body, /\/api\/(?:refresh|enrich-candidate|candidates)/i, 'SPA shell references a legacy browser API');

for (const pathname of ['/', '/races', '/leagues/demo/']) {
  const page = pathname === '/' ? root : await get(pathname);
  assert.match(page.body, /id=["']root["']/i, `${pathname} did not receive the SPA fallback`);
}

const assets = [...root.body.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
assert.ok(assets.length > 0, 'SPA shell did not reference hashed assets');
for (const asset of [...new Set(assets)]) {
  const loaded = await get(asset);
  assert.ok(loaded.body.length > 0, `${asset} was empty`);
}

console.log(`Hosting deep-link smoke passed: ${assets.length} hashed asset references checked.`);
