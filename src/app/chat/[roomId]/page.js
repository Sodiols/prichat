"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  limit,
  updateDoc,
  deleteDoc,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import MessageBubble from "@/components/MessageBubble";
import RoomAdminPanel from "@/components/RoomAdminPanel";
import CallPanel from "@/components/CallPanel";
import MobileMenuButton from "@/components/MobileMenuButton";
import UserAvatar from "@/components/UserAvatar";
import { isSystemAdminEmail } from "@/lib/systemAdmin";

const EMOJI_OPTIONS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😎",
  "😭",
  "😅",
  "😉",
  "🙌",
  "👏",
  "🔥",
  "✨",
  "💙",
  "❤️",
  "👍",
  "🙏",
  "🎉",
  "🤔",
  "✅",
  "⭐",
  "💬",
  "🌙",
  "☕",
  "🚀",
];

function getSendErrorMessage(err) {
  const code = err?.code || "";
  const message = err?.message || "";

  if (code.includes("permission-denied")) {
    return "Message sending was blocked by Firestore rules. Upload the latest firestore.rules file.";
  }

  return message || "Message could not be sent. Check Firebase Firestore rules.";
}


export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [roomState, setRoomState] = useState("loading"); // loading | ok | not-found | denied
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "rooms", roomId),
      (snap) => {
        if (!snap.exists()) {
          setRoomState("not-found");
          return;
        }
        setRoom({ id: snap.id, ...snap.data() });
        setRoomState("ok");
      },
      () => setRoomState("denied")
    );
    return () => unsub();
  }, [roomId]);

  const isMember = !!room?.members?.includes(user.uid);
  const isAdmin = !!room?.admins?.includes(user.uid);
  const isSystemAdmin = isSystemAdminEmail(user?.email);
  const hasRoomAccess = isMember || isAdmin || isSystemAdmin;
  const isReady = roomState === "ok" && hasRoomAccess;

  useEffect(() => {
    if (!isReady) return;
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [roomId, isReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setShowEmojiPicker(false);
    setError("");

    try {
      const messageData = {
        text: trimmed,
        type: "text",
        uid: user.uid,
        displayName: user.displayName || user.email,
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      };

      if (replyTo) {
        messageData.replyTo = cleanReply(replyTo);
      }

      await addDoc(collection(db, "rooms", roomId, "messages"), messageData);
      setText("");
      setReplyTo(null);
    } catch (err) {
      console.error("Message send failed:", err);
      setError(getSendErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setText((current) => `${current}${emoji}`);
    inputRef.current?.focus();
  };

  const handleReplyMessage = (message) => {
    setReplyTo(cleanReply(message));
    setShowEmojiPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleStartEditMessage = (message) => {
    const canEdit = message.uid === user.uid || isSystemAdmin;
    if (!canEdit) return;
    setEditingMessage(message);
    setEditText(message.text || "");
  };

  const handleSaveEditMessage = async (e) => {
    e.preventDefault();
    if (!editingMessage || savingEdit) return;

    const trimmed = editText.trim();
    if (!trimmed) return;

    const canEdit = editingMessage.uid === user.uid || isSystemAdmin;
    if (!canEdit) return;

    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "rooms", roomId, "messages", editingMessage.id), {
        text: trimmed,
        editedAt: serverTimestamp(),
      });
      setEditingMessage(null);
      setEditText("");
    } catch {
      alert("Couldn't edit this message. Check your Firestore rules and try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = async (message) => {
    const canDelete = message.uid === user.uid || isSystemAdmin;
    if (!canDelete || deletingMessageId) return;

    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    setDeletingMessageId(message.id);
    try {
      await deleteDoc(doc(db, "rooms", roomId, "messages", message.id));
    } catch {
      alert("Couldn't delete this message. Check your Firestore rules and try again.");
    } finally {
      setDeletingMessageId("");
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    setLeaveError("");
    try {
      const remaining = room.members.filter((uid) => uid !== user.uid);
      const wasOnlyAdmin = isAdmin && room.admins.length === 1;

      if (wasOnlyAdmin && remaining.length > 0) {
        setLeaveError(
          "You're the only admin. Promote someone else from Manage before you leave."
        );
        return;
      }

      if (remaining.length === 0) {
        await deleteDoc(doc(db, "rooms", room.id));
      } else if (isAdmin) {
        await updateDoc(doc(db, "rooms", room.id), {
          members: arrayRemove(user.uid),
          admins: arrayRemove(user.uid),
        });
      } else {
        await updateDoc(doc(db, "rooms", room.id), { members: arrayRemove(user.uid) });
      }
      router.push("/chat");
    } catch (err) {
      setLeaveError("Couldn't leave the room. Try again.");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex h-[78px] shrink-0 items-center gap-3 border-b border-border bg-surface px-3 text-textPrimary shadow-sm sm:h-[72px] sm:px-6">
        <MobileMenuButton variant="back" className="hover:bg-surfaceHover" />

        {isReady ? (
          <>
            <UserAvatar name={room.name} photoURL={room.photoURL} size="md" />

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16px] font-semibold leading-tight">{room.name}</h1>
              <p className="truncate text-xs text-textSecondary">Realtime private chat</p>
            </div>

            <div className="flex items-center gap-1 text-textSecondary">
              {(isAdmin || isSystemAdmin) && (
                <HeaderIconButton label="Manage room" onClick={() => setShowAdmin(true)}>
                  <GroupIcon />
                </HeaderIconButton>
              )}
              <HeaderIconButton
                label="Voice call"
                onClick={() => document.getElementById("call-audio-button")?.click()}
              >
                <PhoneIcon />
              </HeaderIconButton>
              <HeaderIconButton
                label="Video call"
                onClick={() => document.getElementById("call-video-button")?.click()}
              >
                <VideoIcon />
              </HeaderIconButton>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              {(isAdmin || isSystemAdmin) && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-textSecondary hover:bg-surfaceHover hover:text-textPrimary"
                >
                  Manage
                </button>
              )}
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-textSecondary hover:bg-surfaceHover hover:text-red-400"
              >
                Leave
              </button>
            </div>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-display font-semibold text-textPrimary">PriChat</span>
        )}
      </header>

      {isReady && (
        <CallPanel
          roomId={roomId}
          room={room}
          user={user}
          isAdmin={isAdmin}
          isSystemAdmin={isSystemAdmin}
        />
      )}

      {roomState === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-3 w-3 animate-pulse rounded-full bg-accent" />
        </div>
      )}

      {roomState === "not-found" && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-textPrimary">
          <h2 className="mb-1 font-display text-lg font-semibold">Room not found</h2>
          <p className="text-sm text-textSecondary">It may have been deleted, or the ID is wrong.</p>
        </div>
      )}

      {(roomState === "denied" || (room && !hasRoomAccess)) && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-textPrimary">
          <h2 className="mb-1 font-display text-lg font-semibold">You don&apos;t have access yet</h2>
          <p className="mb-4 max-w-xs text-sm text-textSecondary">
            {room?.privacy === "approval"
              ? "This room requires admin approval. Use \"Join by ID\" in the sidebar with this room's ID to send a request."
              : room?.privacy === "passcode"
              ? "This room needs a passcode. Use \"Join by ID\" in the sidebar to enter it."
              : "Find it under \"Discover public rooms\" in the sidebar and click Join, or use \"Join by ID\"."}
          </p>
          <button onClick={() => router.push("/chat")} className="text-sm text-accent hover:underline">
            Back to rooms
          </button>
        </div>
      )}

      {isReady && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-8">
            <div className="flex w-full flex-col gap-3">
              {messages.length === 0 && (
                <p className="mx-auto mt-10 rounded-full border border-border bg-surface px-4 py-2 text-center text-sm text-textSecondary">
                  No messages yet. Say something.
                </p>
              )}
              {messages.map((m) => {
                const isMessageOwner = m.uid === user.uid;
                const canEditOrDeleteMessage = isSystemAdmin || isMessageOwner;

                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isOwn={isMessageOwner}
                    canEdit={canEditOrDeleteMessage}
                    canDelete={canEditOrDeleteMessage}
                    onReply={handleReplyMessage}
                    onEdit={handleStartEditMessage}
                    onDelete={handleDeleteMessage}
                    deleting={deletingMessageId === m.id}
                  />
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          <form
            onSubmit={handleSend}
            className="relative shrink-0 border-t border-border bg-bg/95 px-2 pb-3 pt-2 sm:px-5"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="w-full">
              {showEmojiPicker && (
                <div className="absolute bottom-[4.75rem] left-3 z-10 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-3 shadow-2xl sm:bottom-[4.25rem] sm:left-5">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleEmojiSelect(emoji)}
                        className="h-8 w-8 rounded-lg text-lg transition hover:bg-surfaceHover active:scale-95"
                        aria-label={`Add ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {replyTo && (
                <div className="mb-2 flex items-start gap-3 rounded-2xl border-l-4 border-accent bg-surface px-4 py-3 text-textPrimary">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-accent">
                      Replying to {replyTo.uid === user.uid ? "yourself" : replyTo.displayName || "Member"}
                    </p>
                    <p className="line-clamp-2 text-xs text-textSecondary">{replyTo.type === "image" ? "Photo" : replyTo.type === "video" ? "Video" : replyTo.text || "Message"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="rounded-full p-1 text-textSecondary hover:bg-surfaceHover hover:text-textPrimary"
                    aria-label="Cancel reply"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}



              {error && <p className="mb-2 px-2 text-xs text-red-400">{error}</p>}

              <div className="flex items-end gap-2">


                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((open) => !open)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg text-textSecondary transition hover:border-accent/50 hover:bg-surfaceHover hover:text-textPrimary active:scale-[0.97]"
                  aria-label="Open emoji picker"
                  title="Emoji"
                >
                  😊
                </button>

                <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-[24px] border border-border bg-surface px-4 text-textPrimary shadow-inner">
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Message"
                    rows={1}
                    className="max-h-32 min-h-[24px] w-full resize-none bg-transparent py-3 text-[15px] leading-6 placeholder:text-textSecondary focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-bg shadow-lg transition hover:opacity-90 active:scale-[0.97] disabled:opacity-45"
                  aria-label="Send message"
                >
                  {sending ? <SpinnerIcon /> : <SendIcon />}
                </button>
              </div>
            </div>
          </form>
        </>
      )}

      {editingMessage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <form onSubmit={handleSaveEditMessage} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-1 font-display text-lg font-semibold">Edit message</h2>
            <p className="mb-3 text-sm text-textSecondary">Update the text, then save it.</p>
            <textarea
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-accent sm:text-sm"
            />
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setEditText("");
                }}
                className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit || !editText.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save edit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAdmin && room && <RoomAdminPanel room={room} onClose={() => setShowAdmin(false)} />}

      {showLeaveConfirm && room && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
            <h2 className="mb-1 font-display text-lg font-semibold">Leave #{room.name}?</h2>
            <p className="mb-4 text-sm text-textSecondary">
              You&apos;ll need to rejoin or be re-added to see messages here again.
            </p>
            {leaveError && <p className="mb-3 text-xs text-red-400">{leaveError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowLeaveConfirm(false);
                  setLeaveError("");
                }}
                className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary"
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {leaving ? "Leaving…" : "Leave room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderIconButton({ label, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surfaceHover hover:text-textPrimary"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function GroupIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M3.8 19.2c.5-3.1 2.3-5 4.7-5s4.2 1.9 4.7 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16.5 10.5v5M14 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.7 4.5 8 4c.7-.1 1.4.2 1.7.9l1 2.3c.3.6.1 1.3-.4 1.8l-1.1 1c.8 1.6 2.1 3 3.7 3.8l1.1-1.1c.5-.5 1.2-.6 1.8-.4l2.3 1c.7.3 1 1 .9 1.7l-.4 2.3c-.1.8-.8 1.3-1.6 1.3C9.9 18.5 4.5 13.1 4.5 6c0-.8.5-1.5 1.2-1.6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5C4 6.1 5.1 5 6.5 5h6C13.9 5 15 6.1 15 7.5v9c0 1.4-1.1 2.5-2.5 2.5h-6C5.1 19 4 17.9 4 16.5v-9Z" stroke="currentColor" strokeWidth="2" />
      <path d="m15 10 4-2.3c.7-.4 1.5.1 1.5.9v6.8c0 .8-.8 1.3-1.5.9L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
