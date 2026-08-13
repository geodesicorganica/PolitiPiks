/**
 * Reports whether a candidate has an official Bioguide-linked congressional
 * service identity. This does not imply that any research section has data.
 */
export function hasCongressionalServiceRecord(candidate: unknown): boolean {
  if (typeof candidate !== 'object' || candidate === null) return false;

  const externalIds = (candidate as { externalIds?: unknown }).externalIds;
  if (typeof externalIds !== 'object' || externalIds === null) return false;

  const bioguideId = (externalIds as { bioguideId?: unknown }).bioguideId;
  return typeof bioguideId === 'string' && bioguideId.trim().length > 0;
}
