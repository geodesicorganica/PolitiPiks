import { useState, useEffect } from 'react';
import { ContestResearchBundle } from '../types';
import { buildContestResearchBundle } from '../lib/researchBundle';

export type ResearchTarget =
  | { kind: 'race'; raceId: string; initialCandidateId?: string }
  | { kind: 'measure'; measureId: string }
  | null;

export function useContestResearch(target: ResearchTarget) {
  const [bundle, setBundle] = useState<ContestResearchBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!target) {
      setBundle(null);
      setError(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const targetId = target.kind === 'race' ? target.raceId : target.measureId;
    
    buildContestResearchBundle(targetId, target.kind)
      .then(b => {
        if (isMounted) {
          setBundle(b);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [target]);

  return { bundle, loading, error };
}
