import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db, firebaseEnabled, googleProvider } from '../utils/firebase.js';
import { ensureUniqueDisplayName, hasMatchingUsernameClaim } from '../utils/usernames.js';

const AuthContext = createContext(null);

const getDisplayName = (user) => {
  if (!user) return 'Guest';
  if (user.displayName) return user.displayName;
  if (user.isAnonymous) return `Guest-${user.uid.slice(0, 6)}`;
  return user.email || `Player-${user.uid.slice(0, 6)}`;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setAuthReady(true);
      setProfileReady(true);
      return undefined;
    }

    let active = true;
    let unsub = () => {};

    (async () => {
      try {
        await getRedirectResult(auth);
      } catch (error) {
        if (error?.code && error.code !== 'auth/no-auth-event') {
          console.warn('Google redirect sign-in failed:', error?.message || error);
        }
      }

      if (!active) return;
      unsub = onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      });
    })();

    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      setProfile(null);
      setProfileReady(true);
      return undefined;
    }

    let unsubscribe = null;
    let unloadCleanup = null;
    let active = true;

    const setupProfile = async () => {
      if (!user) {
        setProfile(null);
        setProfileReady(true);
        return;
      }

      try {
        const profileRef = doc(db, 'users', user.uid);
        const desiredDisplayName = getDisplayName(user);
        const snap = await getDoc(profileRef);
        const existing = snap.exists() ? (snap.data() || {}) : null;
        const profilePatch = {
          uid: user.uid,
          email: user.email || null,
          photoURL: user.photoURL || null,
          isAnonymous: user.isAnonymous,
          updatedAt: serverTimestamp()
        };

        if (!existing || typeof existing.rating !== 'number') {
          profilePatch.rating = 1200;
        }
        if (!existing?.createdAt) {
          profilePatch.createdAt = serverTimestamp();
        }

        let hasValidUsernameClaim = false;
        if (existing?.displayName && existing?.usernameKey) {
          hasValidUsernameClaim = await hasMatchingUsernameClaim({
            db,
            uid: user.uid,
            usernameKey: existing.usernameKey,
            displayName: existing.displayName
          });
        }

        if (!existing || !existing.displayName || !existing.usernameKey || !hasValidUsernameClaim) {
          await ensureUniqueDisplayName({
            db,
            uid: user.uid,
            desiredDisplayName: existing?.displayName || desiredDisplayName,
            fallbackDisplayName: user.isAnonymous
              ? desiredDisplayName
              : (user.email || `Player-${user.uid.slice(0, 6)}`),
            previousUsernameKey: existing?.usernameKey || null,
            profilePatch
          });
        } else {
          await setDoc(profileRef, profilePatch, { merge: true });
        }

        // Mark user as online
        await setDoc(profileRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });

        if (!active) return;

        // Mark offline on tab close (attached after active check so ref is accessible in cleanup)
        const handleUnload = () => {
          setDoc(profileRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        };
        window.addEventListener('beforeunload', handleUnload);
        unloadCleanup = () => window.removeEventListener('beforeunload', handleUnload);

        unsubscribe = onSnapshot(
          profileRef,
          (docSnap) => {
            if (!docSnap.exists()) {
              setProfile(null);
              setProfileReady(true);
              return;
            }
            setProfile({ id: docSnap.id, ...docSnap.data() });
            setProfileReady(true);
          },
          (error) => {
            console.warn('Auth profile snapshot failed:', error?.message || error);
            if (active) {
              setProfile(null);
              setProfileReady(true);
            }
          }
        );
      } catch (error) {
        console.warn('Auth profile setup failed:', error?.message || error);
        if (active) {
          setProfile(null);
          setProfileReady(true);
        }
      }
    };

    setupProfile();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
      if (unloadCleanup) unloadCleanup();
      // Mark offline when signing out / user changes
      if (user && db) {
        setDoc(doc(db, 'users', user.uid), { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    };
  }, [user]);

  const firebaseNotReadyError = () =>
    Promise.reject(new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars.'));

  const value = useMemo(() => {
    return {
      user,
      authReady,
      profile,
      profileReady,
      rating: profile?.rating ?? 1200,
      displayName: profile?.displayName || getDisplayName(user),
      signInWithGoogle: async () => {
        if (!firebaseEnabled || !auth || !googleProvider) return firebaseNotReadyError();
        try {
          return await signInWithPopup(auth, googleProvider);
        } catch (error) {
          const fallbackCodes = new Set([
            'auth/popup-blocked',
            'auth/popup-closed-by-user',
            'auth/cancelled-popup-request',
            'auth/operation-not-supported-in-this-environment',
          ]);
          if (fallbackCodes.has(error?.code)) {
            await signInWithRedirect(auth, googleProvider);
            return null;
          }
          throw error;
        }
      },
      signInWithEmail: (email, password) => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return signInWithEmailAndPassword(auth, email, password);
      },
      signUpWithEmail: (email, password) => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return createUserWithEmailAndPassword(auth, email, password);
      },
      signInAnonymously: () => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return firebaseSignInAnonymously(auth).catch((error) => {
          if (error?.code === 'auth/admin-restricted-operation') {
            const friendly = new Error(
              'Guest login is disabled in Firebase. Enable Anonymous sign-in in Authentication -> Sign-in method.'
            );
            friendly.code = error.code;
            throw friendly;
          }
          throw error;
        });
      },
      signOut: async () => {
        if (!firebaseEnabled || !auth) return Promise.resolve();
        if (user && db) {
          // Best-effort presence update only. Sign-out should still succeed if Firestore is offline.
          setDoc(doc(db, 'users', user.uid), { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        }
        return firebaseSignOut(auth);
      }
    };
  }, [user, authReady, profile, profileReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
