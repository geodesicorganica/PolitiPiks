import { z } from 'zod';

export const CandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  party: z.string().min(1),
  incumbent: z.boolean().optional(),
});

export const RaceSchema = z.object({
  id: z.string().min(1),
  state: z.string().min(1),
  office: z.string().min(1),
  district: z.string().nullable().optional(),
  electionYear: z.number().int().optional(),
  mode: z.enum(['sandbox', 'live']).optional(),
  status: z.enum(['upcoming', 'live', 'called']).optional(),
  winnerId: z.string().min(1).optional(),
  closeDate: z.string().min(1),
  candidates: z.array(CandidateSchema).min(1),
});

export const BallotMeasureSchema = z.object({
  id: z.string().min(1),
  state: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  electionYear: z.number().int().optional(),
  mode: z.enum(['sandbox', 'live']).optional(),
  status: z.enum(['upcoming', 'live', 'called']).optional(),
  result: z.enum(['pass', 'fail']).optional(),
  closeDate: z.string().min(1),
});

export const SourcePayloadSchema = z.object({
  races: z.array(RaceSchema).default([]),
  ballotMeasures: z.array(BallotMeasureSchema).default([]),
});

export type SourcePayload = z.infer<typeof SourcePayloadSchema>;
