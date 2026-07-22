export type CandidateRecord = {
  id: string;
  externalIds?: { fecCandidateId?: string };
  [key: string]: unknown;
};

export type CandidateReconciliation = {
  candidates: CandidateRecord[];
  protectedCandidateIds: string[];
  identityConflicts: Array<{ existingId: string; incomingId: string; fecCandidateId: string }>;
};

function fecId(candidate: CandidateRecord) {
  return candidate.externalIds?.fecCandidateId?.trim() || null;
}

/**
 * Preserve every stored candidate ID. A FEC identity matching a different
 * stored ID is reported for an explicit migration; refreshes never rename or
 * delete it, especially when it is referenced by a prediction.
 */
export function reconcileCandidates(
  existingCandidates: CandidateRecord[],
  incomingCandidates: CandidateRecord[],
  protectedIds: Set<string>,
): CandidateReconciliation {
  const candidates = existingCandidates.map((candidate) => ({ ...candidate }));
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const byFecId = new Map(candidates.flatMap((candidate) => {
    const id = fecId(candidate);
    return id ? [[id, candidate] as const] : [];
  }));
  const identityConflicts: CandidateReconciliation['identityConflicts'] = [];

  for (const incoming of incomingCandidates) {
    const sameId = byId.get(incoming.id);
    if (sameId) {
      Object.assign(sameId, incoming, { id: sameId.id });
      continue;
    }
    const incomingFecId = fecId(incoming);
    const sameFecIdentity = incomingFecId ? byFecId.get(incomingFecId) : undefined;
    if (sameFecIdentity) {
      identityConflicts.push({ existingId: sameFecIdentity.id, incomingId: incoming.id, fecCandidateId: incomingFecId! });
      continue;
    }
    const next = { ...incoming };
    candidates.push(next);
    byId.set(next.id, next);
    if (incomingFecId) byFecId.set(incomingFecId, next);
  }

  return {
    candidates,
    protectedCandidateIds: candidates.filter((candidate) => protectedIds.has(candidate.id)).map((candidate) => candidate.id),
    identityConflicts,
  };
}
