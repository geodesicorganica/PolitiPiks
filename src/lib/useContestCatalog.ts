import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { ACTIVE_ELECTION_MODE, ACTIVE_ELECTION_YEAR } from './electionCycle';
import { selectContestCatalog, type ContestCatalogActivation } from './contestCatalog';
import type { BallotMeasure, Race } from '../types';

/** Shared live catalog subscription. No consumer reads the migration namespace directly. */
export function useContestCatalog() {
  const [races, setRaces] = useState<Race[]>([]);
  const [measures, setMeasures] = useState<BallotMeasure[]>([]);
  const [activation, setActivation] = useState<ContestCatalogActivation | null>(null);
  const [loaded, setLoaded] = useState({ races: false, measures: false, activation: false });
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const activeRaces = query(collection(db, 'races'), where('electionYear', '==', ACTIVE_ELECTION_YEAR), where('mode', '==', ACTIVE_ELECTION_MODE));
    const activeMeasures = query(collection(db, 'ballotMeasures'), where('electionYear', '==', ACTIVE_ELECTION_YEAR), where('mode', '==', ACTIVE_ELECTION_MODE));
    const unsubscribeActivation = onSnapshot(doc(db, 'catalogActivations', 'canonical-2026'), (snapshot) => {
      setActivation(snapshot.exists() ? snapshot.data() as ContestCatalogActivation : null);
      setLoaded((current) => ({ ...current, activation: true }));
    }, () => {
      setFailure('The contest catalog selector could not be loaded.');
      setLoaded((current) => ({ ...current, activation: true }));
    });
    const unsubscribeRaces = onSnapshot(activeRaces, (snapshot) => {
      setRaces(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Race)));
      setLoaded((current) => ({ ...current, races: true }));
    }, () => {
      setFailure('The race catalog could not be loaded.');
      setLoaded((current) => ({ ...current, races: true }));
    });
    const unsubscribeMeasures = onSnapshot(activeMeasures, (snapshot) => {
      setMeasures(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as BallotMeasure)));
      setLoaded((current) => ({ ...current, measures: true }));
    }, () => {
      setFailure('The ballot-measure catalog could not be loaded.');
      setLoaded((current) => ({ ...current, measures: true }));
    });
    return () => { unsubscribeActivation(); unsubscribeRaces(); unsubscribeMeasures(); };
  }, []);

  const catalog = useMemo(() => selectContestCatalog({ races, measures, activation }), [races, measures, activation]);
  return {
    loading: !loaded.races || !loaded.measures || !loaded.activation,
    error: failure ?? (catalog.status === 'error' ? catalog.message : null),
    races: catalog.status === 'ready' ? catalog.races : [],
    measures: catalog.status === 'ready' ? catalog.measures : [],
    activeFederalGeneration: catalog.status === 'ready' ? catalog.activeFederalGeneration : null,
  };
}
