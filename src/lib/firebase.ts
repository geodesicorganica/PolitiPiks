import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ENABLE_TEST_AUTH,
  TEST_AUTH_DISPLAY_NAME,
  TEST_AUTH_EMAIL,
  TEST_AUTH_PASSWORD,
  USE_FIREBASE_EMULATORS,
} from './config';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

declare global {
  interface Window {
    __POLITIPICK_FIREBASE_EMULATORS_CONNECTED__?: boolean;
  }
}

function isLocalBrowser() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

if (USE_FIREBASE_EMULATORS && typeof window !== 'undefined' && !window.__POLITIPICK_FIREBASE_EMULATORS_CONNECTED__) {
  if (!isLocalBrowser()) {
    throw new Error('Firebase emulators can only be enabled from localhost.');
  }

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  window.__POLITIPICK_FIREBASE_EMULATORS_CONNECTED__ = true;
}

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

function assertTestAuthAllowed() {
  if (!ENABLE_TEST_AUTH || !USE_FIREBASE_EMULATORS || !isLocalBrowser()) {
    throw new Error('Test auth is only available on localhost with Firebase emulators enabled.');
  }
}

async function normalizeTestUserProfile(user: User) {
  if (user.displayName !== TEST_AUTH_DISPLAY_NAME) {
    await updateProfile(user, { displayName: TEST_AUTH_DISPLAY_NAME });
  }
  return user;
}

export const signInWithTestUser = async () => {
  assertTestAuthAllowed();

  try {
    const result = await signInWithEmailAndPassword(auth, TEST_AUTH_EMAIL, TEST_AUTH_PASSWORD);
    return await normalizeTestUserProfile(result.user);
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found' && error?.code !== 'auth/invalid-credential') {
      throw error;
    }
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, TEST_AUTH_EMAIL, TEST_AUTH_PASSWORD);
    return await normalizeTestUserProfile(result.user);
  } catch (error: any) {
    if (error?.code === 'auth/email-already-in-use') {
      const result = await signInWithEmailAndPassword(auth, TEST_AUTH_EMAIL, TEST_AUTH_PASSWORD);
      return await normalizeTestUserProfile(result.user);
    }
    throw error;
  }
};

export const logout = () => signOut(auth);

// Test connection strictly for diagnostics in this environment
async function testConnection() {
  try {
    // Attempt to touch the server to verify config
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error?.message?.includes('the client is offline') || error?.message?.includes('Backend didn\'t respond')) {
      console.error("Firebase connection issue detected. Client may be operating in offline mode.");
    }
  }
}

testConnection();
