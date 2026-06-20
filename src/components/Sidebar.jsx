"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { isSystemAdminEmail } from "@/lib/systemAdmin";
import CreateRoomModal from "./CreateRoomModal";
import JoinRoomModal from "./JoinRoomModal";
import ProfileModal from "./ProfileModal";
import UserAvatar from "./UserAvatar";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { mobileOpen, closeMobile } = useSidebar();
  const [myRooms, setMyRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [privateRooms, setPrivateRooms] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joiningPrivateRoom, setJoiningPrivateRoom] = useState("");
  const [privateRoomError, setPrivateRoomError] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const isSystemAdmin = isSystemAdminEmail(user?.email);

  useEffect(() => {
    if (!user) return undefined;

    let memberRooms = [];
    let adminRooms = [];

    const syncRooms = () => {
      const byId = new Map();
      [...memberRooms, ...adminRooms].forEach((room) => byId.set(room.id, room));
      const rooms = Array.from(byId.values());
      rooms.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMyRooms(rooms);
    };

    const memberQuery = query(collection(db, "rooms"), where("members", "array-contains", user.uid));
    const adminQuery = query(collection(db, "rooms"), where("admins", "array-contains", user.uid));

    const unsubMembers = onSnapshot(memberQuery, (snap) => {
      memberRooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      syncRooms();
    });

    const unsubAdmins = onSnapshot(adminQuery, (snap) => {
      adminRooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      syncRooms();
    });

    return () => {
      unsubMembers();
      unsubAdmins();
    };
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, "rooms"), where("privacy", "==", "public"));
    const unsub = onSnapshot(q, (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rooms.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setPublicRooms(rooms);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isSystemAdmin) {
      setPrivateRooms([]);
      return undefined;
    }

    const q = query(collection(db, "rooms"), where("privacy", "in", ["passcode", "approval"]));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rooms.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setPrivateRooms(rooms);
        setPrivateRoomError("");
      },
      () => {
        setPrivateRoomError("Couldn't load private rooms.");
      }
    );

    return () => unsub();
  }, [isSystemAdmin]);

  const notYetJoinedPublicRooms = publicRooms.filter(
    (r) => !r.members?.includes(user?.uid) && !r.admins?.includes(user?.uid)
  );

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleQuickJoin = async (roomId) => {
    await updateDoc(doc(db, "rooms", roomId), { members: arrayUnion(user.uid) });
    closeMobile();
    router.push(`/chat/${roomId}`);
  };

  const handlePrivateRoomJoin = async (room, mode) => {
    if (!isSystemAdmin || !user) return;

    const isMember = room.members?.includes(user.uid);
    const isRoomAdmin = room.admins?.includes(user.uid);

    if ((mode === "normal" && isMember) || (mode === "admin" && isRoomAdmin)) {
      closeMobile();
      router.push(`/chat/${room.id}`);
      return;
    }

    setPrivateRoomError("");
    setJoiningPrivateRoom(`${room.id}-${mode}`);

    try {
      if (mode === "admin") {
        await updateDoc(doc(db, "rooms", room.id), { admins: arrayUnion(user.uid) });
      } else {
        await updateDoc(doc(db, "rooms", room.id), { members: arrayUnion(user.uid) });
      }

      closeMobile();
      router.push(`/chat/${room.id}`);
    } catch (error) {
      setPrivateRoomError("Couldn't join this private room. Check Firestore rules.");
    } finally {
      setJoiningPrivateRoom("");
    }
  };

  return (
    <>
      <aside
        className={`fixed md:static z-20 top-0 left-0 h-full w-72 bg-surface border-r border-border flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <PriChatMark />
            <span className="font-display font-semibold text-lg tracking-tight truncate">PriChat</span>
          </div>
          <button
            onClick={closeMobile}
            className="md:hidden text-textSecondary hover:text-textPrimary p-1 shrink-0"
            aria-label="Close rooms menu"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 pt-4 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex-1 text-sm rounded-lg bg-accent text-bg font-medium py-2 active:scale-[0.97] transition-transform"
          >
            + New room
          </button>
          <button
            type="button"
            onClick={() => setShowJoin(true)}
            className="flex-1 text-sm rounded-lg border border-border hover:bg-surfaceHover py-2 active:scale-[0.97] transition-transform"
          >
            Join by ID
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 mt-2 space-y-4">
          <div>
            <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-textSecondary">
              Your rooms
            </p>
            {myRooms.length === 0 && (
              <p className="px-3 py-2 text-sm text-textSecondary">
                No rooms yet — create or join one.
              </p>
            )}
            <div className="space-y-0.5">
              {myRooms.map((room) => {
                const active = pathname === `/chat/${room.id}`;
                return (
                  <Link
                    key={room.id}
                    href={`/chat/${room.id}`}
                    onClick={closeMobile}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 sm:py-2 text-sm transition-colors ${
                      active ? "bg-accentMuted text-accent" : "text-textPrimary hover:bg-surfaceHover"
                    }`}
                  >
                    <span className="truncate"># {room.name}</span>
                    {room.privacy !== "public" && <LockIcon />}
                  </Link>
                );
              })}
            </div>
          </div>

          {isSystemAdmin && (
            <div>
              <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-textSecondary">
                Private rooms
              </p>
              {privateRoomError && <p className="px-3 py-1 text-xs text-red-400">{privateRoomError}</p>}
              {privateRooms.length === 0 && !privateRoomError && (
                <p className="px-3 py-2 text-sm text-textSecondary">No private rooms found.</p>
              )}
              <div className="space-y-1.5">
                {privateRooms.map((room) => {
                  const active = pathname === `/chat/${room.id}`;
                  const isMember = room.members?.includes(user?.uid);
                  const isRoomAdmin = room.admins?.includes(user?.uid);
                  const joiningNormal = joiningPrivateRoom === `${room.id}-normal`;
                  const joiningAdmin = joiningPrivateRoom === `${room.id}-admin`;

                  return (
                    <div
                      key={room.id}
                      className={`rounded-lg border px-3 py-2 transition-colors ${
                        active ? "border-accent bg-accentMuted" : "border-border bg-bg/40 hover:bg-surfaceHover"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 mb-2">
                        <span className="truncate text-sm font-medium"># {room.name}</span>
                        <LockIcon />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] capitalize text-textSecondary">
                          {room.privacy === "passcode" ? "Passcode" : "Approval"}
                        </span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePrivateRoomJoin(room, "normal")}
                            disabled={!!joiningPrivateRoom}
                            className="rounded-md border border-border px-2 py-1 text-[11px] text-textSecondary hover:text-textPrimary hover:border-accent/50 disabled:opacity-50"
                          >
                            {joiningNormal ? "Joining…" : isMember ? "Open" : "Join normal"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrivateRoomJoin(room, "admin")}
                            disabled={!!joiningPrivateRoom}
                            className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-bg disabled:opacity-50"
                          >
                            {joiningAdmin ? "Joining…" : isRoomAdmin ? "Open admin" : "Join admin"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notYetJoinedPublicRooms.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-textSecondary">
                Discover public rooms
              </p>
              <div className="space-y-0.5">
                {notYetJoinedPublicRooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 sm:py-2 text-sm text-textPrimary hover:bg-surfaceHover"
                  >
                    <span className="truncate"># {room.name}</span>
                    <button
                      onClick={() => handleQuickJoin(room.id)}
                      className="text-accent text-xs hover:underline shrink-0"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div
          className="border-t border-border px-4 py-4 shrink-0"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <UserAvatar name={user?.displayName || user?.email} photoURL={user?.photoURL} size="md" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface animate-pulse-slow" />
            </div>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="flex-1 min-w-0 text-left"
              title="Edit profile"
            >
              <p className="text-sm font-medium truncate hover:text-accent">{user?.displayName || user?.email}</p>
              <p className="text-xs text-textSecondary truncate">Edit profile</p>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-textSecondary hover:text-textPrimary text-xs"
              title="Log out"
            >
              Exit
            </button>
          </div>
        </div>
      </aside>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinRoomModal onClose={() => setShowJoin(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={closeMobile} />
      )}
    </>
  );
}

function PriChatMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path
        d="M4 14L11 7M11 7L8 7M11 7L11 10"
        stroke="#4FD1C5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 14L17 21M17 21L20 21M17 21L17 18"
        stroke="#ECEDEE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className="text-textSecondary shrink-0"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  );
}
