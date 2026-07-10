"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapJoinRequest, mapProfile } from "@/lib/mappers";
import { useAuth } from "@/context/AuthContext";

// Deduplicated array helpers so we can update the uuid[] columns in place.
const withValue = (arr, value) => Array.from(new Set([...(arr || []), value]));
const withoutValue = (arr, value) => (arr || []).filter((v) => v !== value);

export default function RoomAdminPanel({ room, onClose }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState({}); // uid -> { displayName, photoURL, email }
  const [requests, setRequests] = useState([]);
  const [addEmail, setAddEmail] = useState("");
  const [renameValue, setRenameValue] = useState(room.name || "");
  const [renamingRoom, setRenamingRoom] = useState(false);
  const [error, setError] = useState("");
  const [busyUid, setBusyUid] = useState(null);
  const [addBusy, setAddBusy] = useState(false);

  const isLastAdmin = room.admins.length <= 1;

  const updateRoom = (patch) => supabase.from("rooms").update(patch).eq("id", room.id);
  const displayHandle = (profile) => profile?.username || profile?.displayName || "Member";

  const insertRoomEvent = async (text, eventType, targetUid = null) => {
    await supabase
      .rpc("insert_room_event", {
        p_room_id: room.id,
        p_text: text,
        p_event_type: eventType,
        p_target_uid: targetUid,
      })
      .then(() => {});
  };

  const memberKey = room.members.join(",");

  useEffect(() => {
    setRenameValue(room.name || "");
  }, [room.name]);

  // Load display info for every current member.
  useEffect(() => {
    let active = true;
    supabase
      .from("profiles")
      .select("*")
      .in("id", room.members.length ? room.members : ["00000000-0000-0000-0000-000000000000"])
      .then(({ data }) => {
        if (!active) return;
        const map = {};
        (data || []).forEach((row) => {
          map[row.id] = mapProfile(row);
        });
        setProfiles(map);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey, room.id]);

  // Live join requests, only relevant for approval-gated rooms.
  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from("join_requests")
      .select("*")
      .eq("room_id", room.id);
    setRequests((data || []).map(mapJoinRequest));
  }, [room.id]);

  useEffect(() => {
    if (room.privacy !== "approval") return undefined;
    loadRequests();
    const channel = supabase
      .channel(`join-requests:${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `room_id=eq.${room.id}` },
        () => loadRequests()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, room.privacy, loadRequests]);

  const promote = async (uid) => {
    setBusyUid(uid);
    try {
      await updateRoom({ admins: withValue(room.admins, uid) });
      await insertRoomEvent(
        `${displayHandle(profiles[uid])} was promoted to admin`,
        "admin_promoted",
        uid
      );
    } finally {
      setBusyUid(null);
    }
  };

  const demote = async (uid) => {
    if (isLastAdmin) {
      setError("A room needs at least one admin.");
      return;
    }
    setBusyUid(uid);
    try {
      await updateRoom({ admins: withoutValue(room.admins, uid) });
    } finally {
      setBusyUid(null);
    }
  };

  const remove = async (uid) => {
    if (room.admins.includes(uid) && isLastAdmin) {
      setError("Promote someone else first — a room needs at least one admin.");
      return;
    }
    setBusyUid(uid);
    try {
      await updateRoom({
        members: withoutValue(room.members, uid),
        admins: withoutValue(room.admins, uid),
      });
      await insertRoomEvent(`${displayHandle(profiles[uid])} left`, "room_left", uid);
    } finally {
      setBusyUid(null);
    }
  };

  const handleRenameRoom = async (e) => {
    e.preventDefault();
    const nextName = renameValue.trim();
    if (!nextName || nextName === room.name) return;

    setRenamingRoom(true);
    setError("");
    try {
      const { error: updateError } = await updateRoom({ name: nextName });
      if (updateError) throw updateError;
    } catch {
      setError("Couldn't rename the room. Try again.");
    } finally {
      setRenamingRoom(false);
    }
  };

  const handleAddByEmail = async (e) => {
    e.preventDefault();
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    setAddBusy(true);
    setError("");
    try {
      const { data: target } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (!target) {
        setError("No user found with that email.");
        return;
      }
      if (room.members.includes(target.id)) {
        setError("That person is already a member.");
        return;
      }
      const { error: updateError } = await updateRoom({
        members: withValue(room.members, target.id),
      });
      if (updateError) throw updateError;
      setAddEmail("");
    } catch (err) {
      setError("Couldn't add that person. Try again.");
    } finally {
      setAddBusy(false);
    }
  };

  const approve = async (uid) => {
    setBusyUid(uid);
    try {
      const request = requests.find((r) => r.uid === uid);
      await updateRoom({ members: withValue(room.members, uid) });
      await insertRoomEvent(
        `${displayHandle(profiles[uid] || request)} joined`,
        "room_joined",
        uid
      );
      await supabase.from("join_requests").delete().eq("room_id", room.id).eq("uid", uid);
    } finally {
      setBusyUid(null);
    }
  };

  const deny = async (uid) => {
    setBusyUid(uid);
    try {
      await supabase.from("join_requests").delete().eq("room_id", room.id).eq("uid", uid);
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-semibold">Manage #{room.name}</h2>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary text-sm">
            Close
          </button>
        </div>
        <p className="text-textSecondary text-xs mb-4">Room ID: {room.id}</p>

        <form onSubmit={handleRenameRoom} className="mb-5 flex items-center gap-2">
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Room name"
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={renamingRoom || !renameValue.trim() || renameValue.trim() === room.name}
            className="px-3 py-2 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 shrink-0"
          >
            {renamingRoom ? "Saving…" : "Rename"}
          </button>
        </form>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {room.privacy === "approval" && (
          <div className="mb-5">
            <h3 className="text-xs uppercase tracking-wider text-textSecondary mb-2">
              Pending requests {requests.length > 0 && `(${requests.length})`}
            </h3>
            {requests.length === 0 && (
              <p className="text-sm text-textSecondary">No pending requests.</p>
            )}
            <div className="space-y-1.5">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2"
                >
                  <span className="text-sm truncate">{r.displayName}</span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approve(r.id)}
                      disabled={busyUid === r.id}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => deny(r.id)}
                      disabled={busyUid === r.id}
                      className="text-xs text-textSecondary hover:text-textPrimary disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5">
          <h3 className="text-xs uppercase tracking-wider text-textSecondary mb-2">
            Members ({room.members.length})
          </h3>
          <div className="space-y-1.5">
            {room.members.map((uid) => {
              const profile = profiles[uid];
              const isAdmin = room.admins.includes(uid);
              const isSelf = uid === user.uid;
              return (
                <div
                  key={uid}
                  className="flex items-center justify-between bg-bg border border-border rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm truncate block">
                      {profile?.displayName || "…"} {isSelf && <span className="text-textSecondary">(you)</span>}
                    </span>
                    {isAdmin && <span className="text-[11px] text-accent">Admin</span>}
                  </div>
                  {!isSelf && (
                    <div className="flex gap-2 shrink-0">
                      {isAdmin ? (
                        <button
                          onClick={() => demote(uid)}
                          disabled={busyUid === uid}
                          className="text-xs text-textSecondary hover:text-textPrimary disabled:opacity-50"
                        >
                          Demote
                        </button>
                      ) : (
                        <button
                          onClick={() => promote(uid)}
                          disabled={busyUid === uid}
                          className="text-xs text-accent hover:underline disabled:opacity-50"
                        >
                          Make admin
                        </button>
                      )}
                      <button
                        onClick={() => remove(uid)}
                        disabled={busyUid === uid}
                        className="text-xs text-red-400 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-wider text-textSecondary mb-2">Add someone</h3>
          <form onSubmit={handleAddByEmail} className="flex items-center gap-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="Their account email"
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={addBusy || !addEmail.trim()}
              className="px-3 py-2 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 shrink-0"
            >
              {addBusy ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
