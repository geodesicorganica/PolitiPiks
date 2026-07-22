import { Candidate, ResearchSection, ResearchSource } from '../../src/types';

export type NormalizedVote = 'Yea' | 'Nay' | 'Present';

export type RollCallMember = {
  bioguideId?: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  voteCast?: string;
};

export type RollCall = {
  chamber: 'House' | 'Senate';
  congress: number;
  session: number;
  rollNumber: number;
  date?: string;
  issue?: string;
  title?: string;
  question?: string;
  result?: string;
  sourceUrl: string;
  members: RollCallMember[];
};

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ')) : '';
}

function blocks(xml: string, name: string) {
  return Array.from(xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'gi'))).map((match) => match[1]);
}

export function normalizeVoteCast(raw: string | undefined): NormalizedVote | null {
  const value = raw?.trim().toUpperCase();
  if (value === 'YEA' || value === 'AYE') return 'Yea';
  if (value === 'NAY' || value === 'NO') return 'Nay';
  if (value === 'PRESENT') return 'Present';
  return null;
}

export function parseSenateVoteMenu(xml: string) {
  return blocks(xml, 'vote').map((block) => ({
    rollNumber: Number(tag(block, 'vote_number')),
    date: tag(block, 'vote_date'),
    issue: tag(block, 'issue'),
    question: tag(block, 'question'),
    result: tag(block, 'result'),
    title: tag(block, 'title'),
  })).filter((vote) => Number.isFinite(vote.rollNumber) && vote.rollNumber > 0);
}

export function parseSenateVoteXml(xml: string, sourceUrl: string): RollCall {
  const membersBlock = tagRaw(xml, 'members');
  return {
    chamber: 'Senate',
    congress: Number(tag(xml, 'congress')),
    session: Number(tag(xml, 'session')),
    rollNumber: Number(tag(xml, 'vote_number')),
    date: tag(xml, 'vote_date'),
    issue: tag(xml, 'document_name'),
    title: tag(xml, 'vote_title') || tag(xml, 'vote_document_text'),
    question: tag(xml, 'question') || tag(xml, 'vote_question_text'),
    result: tag(xml, 'vote_result_text') || tag(xml, 'vote_result'),
    sourceUrl,
    members: blocks(membersBlock, 'member').map((member) => ({
      firstName: tag(member, 'first_name'),
      lastName: tag(member, 'last_name'),
      state: tag(member, 'state'),
      voteCast: tag(member, 'vote_cast'),
    })),
  };
}

function tagRaw(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match?.[1] ?? '';
}

function normalizeName(value: string | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

export function memberMatchesCandidate(member: RollCallMember, candidate: Candidate) {
  if (member.bioguideId && candidate.externalIds?.bioguideId) {
    return member.bioguideId.toUpperCase() === candidate.externalIds.bioguideId.toUpperCase();
  }
  const candidateTokens = candidate.name.split(/[\s,]+/).map(normalizeName).filter(Boolean);
  const last = normalizeName(member.lastName);
  const first = normalizeName(member.firstName);
  if (!last || !candidateTokens.includes(last)) return false;
  return !first || candidateTokens.some((token) => token === first || token.startsWith(first) || first.startsWith(token));
}

export function buildVoteRecordResearch(candidate: Candidate, votes: RollCall[], retrievedAt = new Date().toISOString()) {
  const bullets: string[] = [];
  const sources: ResearchSource[] = [];

  for (const vote of votes) {
    const member = vote.members.find((entry) => memberMatchesCandidate(entry, candidate));
    const cast = normalizeVoteCast(member?.voteCast);
    if (!cast) continue;
    const sourceId = `${vote.chamber.toLowerCase()}-${vote.congress}-${vote.session}-${vote.rollNumber}`;
    const subject = vote.issue || vote.title || `Roll call ${vote.rollNumber}`;
    const detail = vote.title && vote.title !== subject ? ` — ${vote.title}` : '';
    const result = vote.result ? ` Result: ${vote.result}.` : '';
    bullets.push(`${cast} on ${subject}${detail}.${result}`.replace(/\.\s*\./g, '.'));
    sources.push({
      id: sourceId,
      label: `${vote.chamber} roll call ${vote.rollNumber}`,
      url: vote.sourceUrl,
      type: 'official',
      retrievedAt,
    });
  }

  const section: ResearchSection | null = bullets.length > 0 ? {
    title: 'Recent Official Roll-Call Votes',
    body: 'These records show official vote actions and do not infer broader policy positions.',
    bullets,
    sourceIds: sources.map((source) => source.id!),
  } : null;
  return { section, sources };
}
