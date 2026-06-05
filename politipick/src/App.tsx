/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, createContext, useContext } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { UserProfile } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Races } from './pages/Races';
import { Leagues } from './pages/Leagues';
import { Admin } from './pages/Admin';
import { AnimatePresence, motion } from 'motion/react';
import { handleFirestoreError, OperationType } from './lib/utils';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState('leagues');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

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
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Subscribe to admin status (so it can be granted without re-login)
    const adminDoc = doc(db, 'admins', user.uid);
    const unsubscribe = onSnapshot(adminDoc, (snap) => {
      setIsAdmin(snap.exists());
    }, () => setIsAdmin(false));

    return () => unsubscribe();
  }, [user]);

  const signIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      const code = error?.code ? ` (${error.code})` : '';
      const message = error?.message ? String(error.message) : 'Sign-in failed.';
      setSignInError(`${message}${code}`);
      console.error(error);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-brand-blue text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-2 border-white border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-brand-blue text-white p-6 grid-paper">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8 rounded-2xl border border-white/15 bg-white/8 p-8 backdrop-blur-md shadow-2xl shadow-black/20"
        >
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-black italic tracking-tighter text-brand-red page-title">POLITIPICK</h1>
            <p className="text-white/65 font-mono text-sm uppercase tracking-widest">Midterm Fantasy Leagues 2026</p>
          </div>
          
          <button
            onClick={signIn}
            disabled={signingIn}
            className="w-full py-4 rounded-xl bg-white text-black font-bold uppercase tracking-tight hover:bg-brand-red hover:text-white transition-colors border border-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>

          {signInError && (
            <div className="rounded-lg border border-brand-red/40 bg-brand-red/10 text-brand-red text-left p-3 font-mono text-[10px] uppercase">
              {signInError}
            </div>
          )}
          
          <p className="text-xs text-white/55 font-mono">
            Picks are locked 1 hour before polls close in each respective state.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn }}>
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
            {currentTab === 'races' && <Races />}
            {currentTab === 'leagues' && <Leagues />}
            {currentTab === 'admin' && isAdmin && <Admin />}
          </motion.div>
        </AnimatePresence>
      </Layout>
    </AuthContext.Provider>
  );
}
