"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);
      setLoading(false);

      if (nextUser) {
        await setDoc(
          doc(db, "users", nextUser.uid),
          {
            uid: nextUser.uid,
            displayName:
              nextUser.displayName || nextUser.email?.split("@")[0] || "Member",
            email: nextUser.email,
            photoURL: nextUser.photoURL || null,
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return undefined;
    const unsub = onSnapshot(doc(db, "users", firebaseUser.uid), (snap) => {
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [firebaseUser]);

  // Keep a "lastSeen" heartbeat fresh while the tab is open, used for presence.
  useEffect(() => {
    if (!firebaseUser) return undefined;
    const tick = () =>
      updateDoc(doc(db, "users", firebaseUser.uid), { lastSeen: serverTimestamp() }).catch(() => {});
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [firebaseUser]);

  const user = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      ...firebaseUser,
      displayName: profile?.displayName || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Member",
      photoURL: profile?.photoURL || firebaseUser.photoURL || null,
    };
  }, [firebaseUser, profile]);

  const signup = async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      displayName,
      email,
      photoURL: null,
      lastSeen: serverTimestamp(),
    });
    return cred.user;
  };

  const updateMyProfile = async ({ displayName, photoURL }) => {
    if (!auth.currentUser) throw new Error("Not signed in");
    const cleanName = displayName?.trim() || "Member";

    await updateProfile(auth.currentUser, {
      displayName: cleanName,
      // Auth profile photo can be a normal URL. The Firestore profile is the real app source.
      photoURL: photoURL?.startsWith("http") ? photoURL : auth.currentUser.photoURL || null,
    }).catch(() => {});

    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        uid: auth.currentUser.uid,
        displayName: cleanName,
        email: auth.currentUser.email,
        photoURL: photoURL || null,
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, loginWithGoogle, logout, updateMyProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
