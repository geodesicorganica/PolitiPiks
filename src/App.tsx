/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, createContext, useContext } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { UserProfile } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Races } from './pages/Races';
import { Leagues } from './pages/Leagues';
import { Leaderboard } from './pages/Leaderboard';
import { LeagueDetail } from './pages/LeagueDetail';
import { CandidateDetail } from './pages/CandidateDetail';
import { Candidate } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { handleFirestoreError, OperationType } from './lib/utils';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<{ candidate: Candidate; raceId: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        setLoading(true); // Restart loading state for profile fetch
        const userDoc = doc(db, 'users', user.uid);
        try {
          const snapshot = await getDoc(userDoc);
          if (snapshot.exists()) {
            setProfile(snapshot.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: user.uid,
              displayName: user.displayName || 'Guest',
              email: user.email || 'no-email@provided.com',
              photoURL: user.photoURL || '',
              totalPoints: 0,
              predictionsCount: 0,
              correctPredictions: 0,
            };
            try {
              await setDoc(userDoc, newProfile);
              setProfile(newProfile);
            } catch (createErr) {
              handleFirestoreError(createErr, OperationType.WRITE, `users/${user.uid}`);
            }
          }
        } catch (error) {
          console.error('Error fetching/creating profile:', error);
          if (error instanceof Error && error.message.includes('{')) {
            // Already handled by handleFirestoreError
          } else {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-brand-blue text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 grid-paper">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-4">
            <h1 className="text-6xl font-black italic tracking-tighter text-brand-red">POLITIPICK</h1>
            <p className="text-slate-400 font-mono text-sm uppercase tracking-widest">Midterm Fantasy Leagues 2026</p>
          </div>
          
          <button
            onClick={signIn}
            className="w-full py-4 bg-white text-black font-bold uppercase tracking-tighter hover:bg-brand-red hover:text-white transition-colors border-2 border-white"
          >
            Sign in with Google
          </button>
          
          <p className="text-xs text-slate-500 font-mono">
            Picks lock before Election Day under the current league safety policy.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn }}>
      <Layout activeTab={currentTab} onTabChange={setCurrentTab}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1"
          >
            {currentTab === 'dashboard' && <Dashboard />}
            {currentTab === 'races' && (
              selectedCandidate 
                ? <CandidateDetail candidate={selectedCandidate.candidate} raceId={selectedCandidate.raceId} onBack={() => setSelectedCandidate(null)} />
                : <Races onSelectCandidate={(candidate, race) => setSelectedCandidate({ candidate, raceId: race.id })} />
            )}
            {currentTab === 'leagues' && (
              selectedLeagueId 
                ? <LeagueDetail leagueId={selectedLeagueId} onBack={() => setSelectedLeagueId(null)} />
                : <Leagues onSelectLeague={setSelectedLeagueId} />
            )}
            {currentTab === 'leaderboard' && <Leaderboard />}
          </motion.div>
        </AnimatePresence>
      </Layout>
    </AuthContext.Provider>
  );
}
