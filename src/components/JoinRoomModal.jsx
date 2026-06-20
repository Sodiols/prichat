"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { sha256Hex } from "@/lib/hash";
import { isSystemAdminEmail } from "@/lib/systemAdmin";
import PasswordInput from "@/components/PasswordInput";

// step: "search" | "public-found" | "passcode" | "approval-request" | "approval-pending" | "already-member"
export default function JoinRoomModal({ onClose }) {
  const { user } = useAuth();
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState(null);
  const [passcode, setPasscode] = useState("");
  const [step, setStep] = useState("search");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminJoining, setAdminJoining] = useState(false);

  const canJoinAsSystemAdmin = isSystemAdminEmail(user?.email);

  const enterRoom = (id) => {
    onClose();
    router.push(`/chat/${id}`);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const trimmed = roomId.trim();
    if (!trimmed) return;
    setError("");
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "rooms", trimmed));
      if (!snap.exists()) {
        setError("No room found with that ID.");
        setRoom(null);
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setRoom(data);

      if (data.members?.includes(user.uid) || data.admins?.includes(user.uid)) {
        setStep("already-member");
      } else if (data.privacy === "public") {
        setStep("public-found");
      } else if (data.privacy === "passcode") {
        setStep("passcode");
      } else {
        const reqSnap = await getDoc(doc(db, "rooms", data.id, "joinRequests", user.uid));
        setStep(reqSnap.exists() ? "approval-pending" : "approval-request");
      }
    } catch (err) {
      setError("Something went wrong looking that up.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPublic = async () => {
    setLoading(true);
    setError("");
    try {
      await updateDoc(doc(db, "rooms", room.id), { members: arrayUnion(user.uid) });
      enterRoom(room.id);
    } catch (err) {
      setError("Couldn't join that room. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAsAdmin = async () => {
    if (!canJoinAsSystemAdmin || !room?.id) return;
    setAdminJoining(true);
    setError("");
    try {
      await updateDoc(doc(db, "rooms", room.id), { admins: arrayUnion(user.uid) });
      enterRoom(room.id);
    } catch (err) {
      setError("Couldn't join as admin. Check your Firestore rules and try again.");
    } finally {
      setAdminJoining(false);
    }
  };

  const handleJoinPasscode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const hash = await sha256Hex(passcode.trim());
      if (hash !== room.passcodeHash) {
        setError("Incorrect passcode.");
        return;
      }
      await updateDoc(doc(db, "rooms", room.id), { members: arrayUnion(user.uid) });
      enterRoom(room.id);
    } catch (err) {
      setError("Couldn't join that room. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestApproval = async () => {
    setLoading(true);
    setError("");
    try {
      await setDoc(doc(db, "rooms", room.id, "joinRequests", user.uid), {
        uid: user.uid,
        displayName: user.displayName || user.email,
        photoURL: user.photoURL || null,
        requestedAt: serverTimestamp(),
      });
      setStep("approval-pending");
    } catch (err) {
      setError("Couldn't send your request. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Join a room</h2>
        <p className="text-textSecondary text-sm mb-4">
          Paste a room ID, including private ones if you have it.
        </p>

        {step === "search" && (
          <form onSubmit={handleSearch} className="space-y-3">
            <input
              autoFocus
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !roomId.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
        )}

        {step === "already-member" && room && (
          <Confirm
            title={`You already have access to #${room.name}`}
            actionLabel="Open room"
            onAction={() => enterRoom(room.id)}
            onClose={onClose}
          />
        )}

        {step === "public-found" && room && (
          <Confirm
            title={`#${room.name} is a public room`}
            subtitle="You can join instantly."
            actionLabel={loading ? "Joining…" : "Join room"}
            onAction={handleJoinPublic}
            onClose={onClose}
            disabled={loading || adminJoining}
            error={error}
            adminActionLabel={adminJoining ? "Joining…" : "Join as admin"}
            onAdminAction={canJoinAsSystemAdmin ? handleJoinAsAdmin : null}
            adminDisabled={loading || adminJoining}
          />
        )}

        {step === "passcode" && room && (
          <form onSubmit={handleJoinPasscode} className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">#{room.name}</span> needs a passcode to join.
            </p>
            <PasswordInput
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoFocus
              autoComplete="off"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary">
                Cancel
              </button>
              {canJoinAsSystemAdmin && (
                <button
                  type="button"
                  onClick={handleJoinAsAdmin}
                  disabled={loading || adminJoining}
                  className="px-3 py-1.5 text-sm rounded-lg border border-accent text-accent font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
                >
                  {adminJoining ? "Joining…" : "Join as admin"}
                </button>
              )}
              <button
                type="submit"
                disabled={loading || adminJoining || !passcode}
                className="px-3 py-1.5 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
              >
                {loading ? "Checking…" : "Join room"}
              </button>
            </div>
          </form>
        )}

        {step === "approval-request" && room && (
          <Confirm
            title={`#${room.name} requires admin approval`}
            subtitle="The room's admin will need to approve you before you can chat."
            actionLabel={loading ? "Sending…" : "Request to join"}
            onAction={handleRequestApproval}
            onClose={onClose}
            disabled={loading || adminJoining}
            error={error}
            adminActionLabel={adminJoining ? "Joining…" : "Join as admin"}
            onAdminAction={canJoinAsSystemAdmin ? handleJoinAsAdmin : null}
            adminDisabled={loading || adminJoining}
          />
        )}

        {step === "approval-pending" && room && (
          <Confirm
            title={`Request sent for #${room.name}`}
            subtitle="You'll be able to open this room as soon as an admin approves you."
            actionLabel="Done"
            onAction={onClose}
            onClose={onClose}
            error={error}
            adminActionLabel={adminJoining ? "Joining…" : "Join as admin"}
            onAdminAction={canJoinAsSystemAdmin ? handleJoinAsAdmin : null}
            adminDisabled={loading || adminJoining}
          />
        )}
      </div>
    </div>
  );
}

function Confirm({
  title,
  subtitle,
  actionLabel,
  onAction,
  onClose,
  disabled,
  error,
  adminActionLabel,
  onAdminAction,
  adminDisabled,
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-textSecondary mt-1">{subtitle}</p>}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary">
          Cancel
        </button>
        {onAdminAction && (
          <button
            type="button"
            onClick={onAdminAction}
            disabled={adminDisabled}
            className="px-3 py-1.5 text-sm rounded-lg border border-accent text-accent font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
          >
            {adminActionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="px-3 py-1.5 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
