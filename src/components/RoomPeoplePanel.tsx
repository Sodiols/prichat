"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { isProfileOnline } from "@/lib/presence";
import UserAvatar from "./UserAvatar";

export default function RoomPeoplePanel({ room, profiles, onClose }) {
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const onlineCount = profiles.filter(isProfileOnline).length;

  const handleAdd = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || adding) return;

    setAdding(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("add_room_member_by_email", {
        p_room_id: room.id,
        p_email: cleanEmail,
      });
      if (rpcError) throw rpcError;
      setEmail("");
    } catch (err) {
      const message = (err?.message || "").toLowerCase();
      setError(
        message.includes("no user")
          ? "No account found with that email."
          : "Couldn't add that person. Try again."
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold text-textPrimary">
              People in #{room.name}
            </h2>
            <p className="mt-1 text-xs text-textSecondary">
              {onlineCount} online · {profiles.length} member{profiles.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-textSecondary hover:text-textPrimary"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <form onSubmit={handleAdd} className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-textSecondary">
              Add by email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={adding || !email.trim()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </form>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-textSecondary">Members</p>
            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {profiles.map((profile) => {
                const online = isProfileOnline(profile);
                return (
                  <div
                    key={profile.uid}
                    className="flex items-center gap-3 rounded-xl border border-border bg-bg/70 px-3 py-2"
                  >
                    <div className="relative shrink-0">
                      <UserAvatar name={profile.displayName} photoURL={profile.photoURL} size="md" />
                      {online && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg bg-accent" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-textPrimary">
                        {profile.displayName || profile.username || "Member"}
                      </p>
                      <p className="truncate text-xs text-textSecondary">
                        {online ? "online" : profile.username ? `@${profile.username}` : "offline"}
                      </p>
                    </div>
                    {online && (
                      <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] text-accent">
                        online
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
