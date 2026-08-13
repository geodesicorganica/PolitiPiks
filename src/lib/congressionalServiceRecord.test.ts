import assert from 'node:assert/strict';
import { hasCongressionalServiceRecord } from './congressionalServiceRecord.js';

assert.equal(
  hasCongressionalServiceRecord({ externalIds: { bioguideId: '  A000360  ' } }),
  true,
  'a non-empty trimmed Bioguide ID establishes a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({}),
  false,
  'a missing Bioguide ID does not establish a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({ externalIds: { bioguideId: null } }),
  false,
  'a null-like Bioguide ID does not establish a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({ externalIds: { bioguideId: '' } }),
  false,
  'an empty Bioguide ID does not establish a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({ externalIds: { bioguideId: ' \t\n ' } }),
  false,
  'a whitespace-only Bioguide ID does not establish a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({ incumbent: true }),
  false,
  'incumbency alone does not establish a congressional service record',
);
assert.equal(
  hasCongressionalServiceRecord({ externalIds: { fecCandidateId: 'H6GA01075' } }),
  false,
  'an FEC candidate ID alone does not establish a congressional service record',
);

console.log('Congressional service record semantics tests passed');
