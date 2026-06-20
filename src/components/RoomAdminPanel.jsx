"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export default function RoomAdminPanel({ room, onClose }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState({}); // uid -> { displayName, photoURL, email }
  const [requests, setRequests] = useState([]);
  const [addEmail, setAddEmail] = useState("");
  const [error, setError] = useState("");
  const [busyUid, setBusyUid] = useState(null);
  const [addBusy, setAddBusy] = useState(false);

  const roomRef = doc(db, "rooms", room.id);
  const isLastAdmin = room.admins.length <= 1;

  const memberKey = room.members.join(",");

  // Load display info for every current member.
  useEffect(() => {
    let active = true;
    Promise.all(
      room.members.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return [uid, snap.exists() ? snap.data() : { displayName: "Unknown", photoURL: null }];
      })
    ).then((entries) => {
      if (active) setProfiles(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey, room.id]);

  // Live join requests, only relevant for approval-gated rooms.
  useEffect(() => {
    if (room.privacy !== "approval") return;
    const unsub = onSnapshot(collection(db, "rooms", room.id, "joinRequests"), (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [room.id, room.privacy]);

  const promote = async (uid) => {
    setBusyUid(uid);
    try {
      await updateDoc(roomRef, { admins: arrayUnion(uid) });
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
      await updateDoc(roomRef, { admins: arrayRemove(uid) });
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
      await updateDoc(roomRef, { members: arrayRemove(uid), admins: arrayRemove(uid) });
    } finally {
      setBusyUid(null);
    }
  };

  const handleAddByEmail = async (e) => {
    e.preventDefault();
    const email = addEmail.trim().toLowerCase();
    if (!email) return;
    setAddBusy(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      if (snap.empty) {
        setError("No user found with that email.");
        return;
      }
      const target = snap.docs[0];
      if (room.members.includes(target.id)) {
        setError("That person is already a member.");
        return;
      }
      await updateDoc(roomRef, { members: arrayUnion(target.id) });
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
      await updateDoc(roomRef, { members: arrayUnion(uid) });
      await deleteDoc(doc(db, "rooms", room.id, "joinRequests", uid));
    } finally {
      setBusyUid(null);
    }
  };

  const deny = async (uid) => {
    setBusyUid(uid);
    try {
      await deleteDoc(doc(db, "rooms", room.id, "joinRequests", uid));
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
