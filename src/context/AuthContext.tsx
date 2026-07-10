"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { mapProfile } from "@/lib/mappers";
import type { AppUser, AuthContextValue, Profile } from "@/lib/types";

const AuthContext = createContext<AuthContextValue | null>(null);

// Derives a friendly display name from the Supabase auth user + its metadata.
function nameFromAuthUser(authUser: User | null): string {
  const meta = (authUser?.user_metadata || {}) as Record<string, string>;
  return (
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    authUser?.email?.split("@")[0] ||
    "Member"
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileChannelRef = useRef<RealtimeChannel | null>(null);

  // Keep the profiles row in sync and subscribe to live changes for the user.
  useEffect(() => {
    let cancelled = false;

    const syncProfile = async (nextAuthUser: User | null) => {
      if (!nextAuthUser) {
        setProfile(null);
        return;
      }

      // Upsert the profile so it always reflects the latest auth details.
      await supabase
        .from("profiles")
        .upsert(
          {
            id: nextAuthUser.id,
            display_name: nameFromAuthUser(nextAuthUser),
            email: nextAuthUser.email,
            last_seen: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .then(() => {});

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", nextAuthUser.id)
        .maybeSingle();

      if (!cancelled && data) setProfile(mapProfile(data));
    };

    const applySession = (session: { user: User } | null) => {
      const nextAuthUser = session?.user ?? null;
      setAuthUser(nextAuthUser);
      setLoading(false);
      syncProfile(nextAuthUser);

      // (Re)subscribe to realtime updates on this user's profile row.
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
      if (nextAuthUser) {
        profileChannelRef.current = supabase
          .channel(`profile:${nextAuthUser.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${nextAuthUser.id}`,
            },
            (payload) => {
              if (payload.eventType === "DELETE") setProfile(null);
              else setProfile(mapProfile(payload.new));
            }
          )
          .subscribe();
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, []);

  // Presence heartbeat: refresh last_seen while a tab is open.
  useEffect(() => {
    if (!authUser) return undefined;
    const tick = () =>
      supabase
        .from("profiles")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", authUser.id)
        .then(() => {});
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [authUser]);

  const user = useMemo<AppUser | null>(() => {
    if (!authUser) return null;
    return {
      uid: authUser.id,
      id: authUser.id,
      email: authUser.email ?? null,
      displayName: profile?.displayName || nameFromAuthUser(authUser),
      photoURL: profile?.photoURL || (authUser.user_metadata?.avatar_url as string) || null,
    };
  }, [authUser, profile]);

  const signup = async (email: string, password: string, displayName: string) => {
    const cleanName = displayName?.trim() || email.split("@")[0];
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: cleanName } },
    });
    if (error) throw error;

    // If email confirmation is disabled the user is signed in immediately and
    // the DB trigger created their profile; make sure the name is applied.
    if (data.user) {
      await supabase
        .from("profiles")
        .upsert({ id: data.user.id, display_name: cleanName, email }, { onConflict: "id" })
        .then(() => {});
    }
    return data.user;
  };

  const updateMyProfile = async ({
    displayName,
    photoURL,
  }: {
    displayName: string;
    photoURL?: string | null;
  }) => {
    if (!authUser) throw new Error("Not signed in");
    const cleanName = displayName?.trim() || "Member";

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: cleanName,
        photo_url: photoURL || null,
        updated_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      })
      .eq("id", authUser.id);
    if (error) throw error;

    // Mirror onto auth metadata so it survives across profile reloads.
    await supabase.auth.updateUser({ data: { display_name: cleanName } }).then(() => {});
  };

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/chat` : undefined,
      },
    });
    if (error) throw error;
  };

  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signup, login, loginWithGoogle, logout, updateMyProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
