import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

type Evidence = Record<string, unknown> | null;

/** Canonical active-path evidence lookup; consumers never read migrationShadows directly. */
export function useCanonicalContestEvidence(raceId: string, candidateId: string) {
  const [research, setResearch] = useState<Evidence>(null);
  const [metrics, setMetrics] = useState<Evidence>(null);
  const [loaded, setLoaded] = useState({ research: false, metrics: false });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoaded({ research: false, metrics: false });
    setError(null);
    const unsubscribeResearch = onSnapshot(doc(db, 'races', raceId, 'candidateResearch', candidateId), (snapshot) => {
      setResearch(snapshot.exists() ? snapshot.data() : null);
      setLoaded((current) => ({ ...current, research: true }));
    }, () => {
      setError('Candidate research could not be loaded.');
      setLoaded((current) => ({ ...current, research: true }));
    });
    const unsubscribeMetrics = onSnapshot(doc(db, 'contestMetrics', raceId), (snapshot) => {
      setMetrics(snapshot.exists() ? snapshot.data() : null);
      setLoaded((current) => ({ ...current, metrics: true }));
    }, () => {
      setError('Contest metrics could not be loaded.');
      setLoaded((current) => ({ ...current, metrics: true }));
    });
    return () => { unsubscribeResearch(); unsubscribeMetrics(); };
  }, [raceId, candidateId]);
  return { research, metrics, loading: !loaded.research || !loaded.metrics, error };
}
