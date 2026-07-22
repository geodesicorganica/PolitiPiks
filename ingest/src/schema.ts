import { z } from 'zod';

const SourceMetadataSchema = z.object({
  source: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  sourceUpdatedAt: z.string().min(1).optional(),
  lastRefreshedAt: z.string().min(1).optional(),
  refreshStatus: z.enum(['stale', 'queued', 'running', 'fresh', 'partial', 'failed']).optional(),
  verificationLevel: z.enum(['seed', 'official', 'derived', 'ai-enriched']).optional(),
});

export const CandidateSchema = SourceMetadataSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  party: z.string().min(1),
  incumbent: z.boolean().optional(),
  aliases: z.array(z.string().min(1)).optional(),
  websiteUrl: z.string().url().optional(),
  qualificationStatus: z.enum(['unresolved', 'filed', 'qualified', 'on_ballot', 'withdrawn', 'inactive']).optional(),
  candidateState: z.enum(['active', 'withdrawn', 'inactive']).optional(),
  visibility: z.enum(['hidden', 'visible']).optional(),
  pickEligibility: z.enum(['ineligible', 'eligible']).optional(),
  ballotVerifiedAt: z.string().min(1).optional(),
  ballotSourceUrl: z.string().url().optional(),
  externalIds: z
    .object({
      bioguideId: z.string().optional(),
      fecCandidateId: z.string().optional(),
      openStatesPersonId: z.string().optional(),
    })
    .optional(),
});

export const RaceSchema = SourceMetadataSchema.extend({
  id: z.string().min(1),
  state: z.string().min(1),
  office: z.string().min(1),
  district: z.string().nullable().optional(),
  electionYear: z.number().int().optional(),
  mode: z.enum(['sandbox', 'live']).optional(),
  status: z.enum(['upcoming', 'live', 'called']).optional(),
  winnerId: z.string().min(1).optional(),
  closeDate: z.string().min(1),
  summary: z.string().min(1).optional(),
  candidates: z.array(CandidateSchema),
});

export const BallotMeasureSchema = SourceMetadataSchema.extend({
  id: z.string().min(1),
  externalIds: z
    .object({
      ballotpediaMeasureId: z.string().optional(),
      stateMeasureId: z.string().optional(),
    })
    .optional(),
  state: z.string().min(1),
  title: z.string().min(1),
  shortTitle: z.string().min(1).optional(),
  description: z.string().min(1),
  electionYear: z.number().int().optional(),
  mode: z.enum(['sandbox', 'live']).optional(),
  status: z.enum(['upcoming', 'live', 'called']).optional(),
  seatKind: z.enum(['regular', 'special']).optional(),
  senateClass: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  qualificationStatus: z.enum(['filed', 'circulating', 'qualified', 'on_ballot', 'withdrawn', 'failed']).optional(),
  result: z.enum(['pass', 'fail']).optional(),
  closeDate: z.string().min(1),
  electionDate: z.string().min(1).optional(),
  measureNumber: z.string().min(1).optional(),
  fullTextUrl: z.string().url().optional(),
});

export const SourcePayloadSchema = z.object({
  races: z.array(RaceSchema).default([]),
  ballotMeasures: z.array(BallotMeasureSchema).default([]),
});

export type SourcePayload = z.infer<typeof SourcePayloadSchema>;

export function assertSeedableSourcePayload(payload: SourcePayload, context = 'contest payload') {
  if (payload.races.length + payload.ballotMeasures.length === 0) {
    throw new Error(`Refusing to seed empty ${context}. Add reviewed official-source records before running this command.`);
  }
}
