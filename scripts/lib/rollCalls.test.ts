import assert from 'node:assert/strict';
import { buildVoteRecordResearch, normalizeVoteCast, parseSenateVoteMenu, parseSenateVoteXml } from './rollCalls.js';

assert.equal(normalizeVoteCast('Aye'), 'Yea');
assert.equal(normalizeVoteCast('Nay'), 'Nay');
assert.equal(normalizeVoteCast('Not Voting'), null);

const menu = parseSenateVoteMenu('<vote_summary><votes><vote><vote_number>00199</vote_number><vote_date>16-Jul</vote_date><issue>S.J.Res. 198</issue><question>On the Motion</question><result>Rejected</result><title>A title</title></vote></votes></vote_summary>');
assert.equal(menu[0].rollNumber, 199);
assert.equal(menu[0].issue, 'S.J.Res. 198');

const xml = '<roll_call_vote><congress>119</congress><session>2</session><vote_number>1</vote_number><vote_date>January 5, 2026</vote_date><vote_title>Confirmation</vote_title><vote_result_text>Confirmed</vote_result_text><document><document_name>PN12-1</document_name></document><members><member><first_name>Jane</first_name><last_name>Doe</last_name><state>GA</state><vote_cast>Yea</vote_cast></member></members></roll_call_vote>';
const vote = parseSenateVoteXml(xml, 'https://senate.example/vote.xml');
assert.equal(vote.members[0].lastName, 'Doe');
const research = buildVoteRecordResearch({ id: 'jane', name: 'Jane Doe', party: 'Democrat' }, [vote]);
assert.ok(research.section?.bullets?.[0].startsWith('Yea on PN12-1'));
assert.equal(research.sources[0].type, 'official');

console.log('Roll-call mapping tests passed');
