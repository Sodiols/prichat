"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, VOICE_BUCKET } from "@/lib/supabase";
import { mapMessage, mapProfile, mapRoom } from "@/lib/mappers";
import { useAuth } from "@/context/AuthContext";
import MessageBubble from "@/components/MessageBubble";
import RoomAdminPanel from "@/components/RoomAdminPanel";
import RoomPeoplePanel from "@/components/RoomPeoplePanel";
import CallPanel from "@/components/CallPanel";
import MobileMenuButton from "@/components/MobileMenuButton";
import UserAvatar from "@/components/UserAvatar";
import { isSystemAdminEmail } from "@/lib/systemAdmin";
import { isProfileOnline } from "@/lib/presence";

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
  const message = err?.message || "";

  if (/row-level security|permission|not authorized|policy/i.test(message)) {
    return "That action was blocked by Supabase security policies. Make sure the schema.sql policies are applied.";
  }

  return message || "Message could not be sent. Please try again.";
}

function cleanReply(message) {
  if (!message) return null;
  return {
    id: message.id || "",
    uid: message.uid || "",
    displayName: message.displayName || "",
    text: message.text || "",
    type: message.type || "text",
    mediaUrl: message.mediaUrl || null,
    photoURL: message.photoURL || null,
  };
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function extractMentionData(text, profiles) {
  const rawMatches = Array.from(text.matchAll(/@([a-zA-Z0-9_]+)/g)).map((match) =>
    normalizeUsername(match[1])
  );
  const mentionedAll = rawMatches.includes("everyone");
  const validNames = new Set(
    profiles
      .map((profile) => profile?.username)
      .filter(Boolean)
      .map((username) => username.toLowerCase())
  );
  const mentionedUsernames = Array.from(
    new Set(rawMatches.filter((name) => name !== "everyone" && validNames.has(name)))
  );
  return { mentionedAll, mentionedUsernames };
}

function getMentionToken(value, cursor) {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  return {
    query: normalizeUsername(match[2] || ""),
    start: beforeCursor.length - (match[2] || "").length - 1,
    end: cursor,
  };
}

async function getNotificationRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  await navigator.serviceWorker.register("/prichat-sw.js").catch(() => null);
  return navigator.serviceWorker.ready.catch(() => null);
}

async function requestWebsiteNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission().catch(() => "denied");
  }
  await getNotificationRegistration();
  return Notification.permission;
}

async function showWebsiteNotification(title, body, url) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  await requestWebsiteNotificationPermission();
  if (Notification.permission === "granted") {
    const registration = await getNotificationRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: `prichat-${url}`,
        data: { url },
      });
      return Notification.permission;
    }
    try {
      new Notification(title, { body });
    } catch {
      // Mobile browsers generally require the service-worker path above.
    }
  }
  return Notification.permission;
}

function getVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function normalizeVoiceMimeType(mimeType) {
  if (mimeType?.includes("ogg")) return "audio/ogg";
  if (mimeType?.includes("mp4")) return "audio/mp4";
  return "audio/webm";
}

function getVoiceExtension(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function formatRecordingTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [roomState, setRoomState] = useState("loading"); // loading | ok | not-found | denied
  const [messages, setMessages] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [readProfilesByMessage, setReadProfilesByMessage] = useState({});
  const [text, setText] = useState("");
  const [mentionToken, setMentionToken] = useState(null);
  const [mentionToast, setMentionToast] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceState, setVoiceState] = useState("idle"); // idle | recording | uploading
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("unsupported");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);
  const recordingCancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
    getNotificationRegistration();
  }, []);

  useEffect(() => {
    let active = true;

    const loadRoom = async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setRoomState("denied");
        return;
      }
      if (!data) {
        setRoomState("not-found");
        return;
      }
      setRoom(mapRoom(data));
      setRoomState("ok");
    };

    loadRoom();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setRoomState("not-found");
            setRoom(null);
            return;
          }
          setRoom(mapRoom(payload.new));
          setRoomState("ok");
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const isMember = !!room?.members?.includes(user?.uid);
  const isAdmin = !!room?.admins?.includes(user?.uid);
  const isSystemAdmin = isSystemAdminEmail(user?.email);
  const hasRoomAccess = isMember || isAdmin || isSystemAdmin;
  const isReady = roomState === "ok" && hasRoomAccess;
  const memberKey = room?.members?.join(",") || "";

  const visibleMessages = useMemo(
    () =>
      messages.filter((message) => {
        if (message.metadata?.eventType !== "call_missed") return true;
        return !message.metadata?.targetUid || message.metadata.targetUid === user?.uid;
      }),
    [messages, user?.uid]
  );

  const mentionSuggestions = useMemo(() => {
    if (!mentionToken) return [];
    const query = mentionToken.query;
    const users = memberProfiles
      .filter((profile) => profile?.username)
      .filter((profile) => {
        if (profile.uid === user?.uid) return false;
        return !query || profile.username.toLowerCase().startsWith(query);
      })
      .slice(0, 6)
      .map((profile) => ({
        type: "user",
        label: `@${profile.username}`,
        value: profile.username,
        subtitle: profile.displayName,
      }));
    const everyone =
      "everyone".startsWith(query) || query === ""
        ? [{ type: "everyone", label: "@everyone", value: "everyone", subtitle: "Notify everyone in this room" }]
        : [];
    return [...everyone, ...users];
  }, [memberProfiles, mentionToken, user?.uid]);

  const onlineMemberProfiles = useMemo(
    () => memberProfiles.filter(isProfileOnline),
    [memberProfiles]
  );
  const onlineCount = onlineMemberProfiles.length;

  useEffect(() => {
    if (!isReady) return undefined;
    let active = true;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (active) setMessages((data || []).map(mapMessage));
    };

    loadMessages();

    const channel = supabase
      .channel(`messages:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const mapped = payload.eventType === "DELETE" ? null : mapMessage(payload.new);
          if (
            payload.eventType === "INSERT" &&
            mapped &&
            mapped.uid !== user?.uid &&
            user?.username &&
            (mapped.mentionedAll || mapped.mentionedUsernames?.includes(user.username.toLowerCase()))
          ) {
            const title = `${mapped.displayName || "Someone"} mentioned you`;
            const body = `#${room?.name || "PriChat"}: ${mapped.text || "Open the room"}`;
            setMentionToast({ title, body });
            window.setTimeout(() => setMentionToast(null), 5000);
            showWebsiteNotification(title, body, `/chat/${roomId}`).then((permission) => {
              if (permission) setNotificationPermission(permission);
            });
          }

          setMessages((current) => {
            if (payload.eventType === "DELETE") {
              return current.filter((m) => m.id !== payload.old.id);
            }
            const exists = current.some((m) => m.id === mapped.id);
            const next = exists
              ? current.map((m) => (m.id === mapped.id ? mapped : m))
              : [...current, mapped];
            next.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, isReady, room?.name, user?.uid, user?.username]);

  useEffect(() => {
    const memberIds = memberKey ? memberKey.split(",") : [];
    if (!isReady || !memberIds.length) {
      setMemberProfiles([]);
      return undefined;
    }

    let active = true;
    const loadProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds);
      if (active) setMemberProfiles((data || []).map(mapProfile).filter(Boolean));
    };

    loadProfiles();
    const channel = supabase
      .channel(`room-profiles:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => loadProfiles()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isReady, memberKey, roomId]);

  const messageReadKey = visibleMessages
    .filter((message) => !["system", "call"].includes(message.type))
    .map((message) => message.id)
    .join(",");

  useEffect(() => {
    const messageIds = messageReadKey ? messageReadKey.split(",") : [];
    if (!isReady || messageIds.length === 0) {
      setReadProfilesByMessage({});
      return undefined;
    }

    let active = true;
    const loadReads = async () => {
      const { data } = await supabase
        .from("message_reads")
        .select("message_id, uid, profiles(*)")
        .in("message_id", messageIds);
      if (!active) return;

      const next = {};
      (data || []).forEach((row) => {
        const profile = mapProfile(row.profiles);
        if (!profile) return;
        next[row.message_id] = [...(next[row.message_id] || []), profile];
      });
      setReadProfilesByMessage(next);
    };

    loadReads();
    const channel = supabase
      .channel(`message-reads:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reads" },
        () => loadReads()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isReady, messageReadKey, roomId]);

  useEffect(() => {
    if (!isReady || !user?.uid) return;
    const rows = visibleMessages
      .filter((message) => !["system", "call"].includes(message.type))
      .filter((message) => message.uid !== user.uid)
      .map((message) => ({
        message_id: message.id,
        uid: user.uid,
        read_at: new Date().toISOString(),
      }));
    if (rows.length === 0) return;
    supabase
      .from("message_reads")
      .upsert(rows, { onConflict: "message_id,uid" })
      .then(() => {});
  }, [isReady, user?.uid, messageReadKey, visibleMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingCancelledRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending || !user) return;

    setSending(true);
    setShowEmojiPicker(false);
    setError("");

    try {
      const mentionData = extractMentionData(trimmed, memberProfiles);
      const messageData: Record<string, any> = {
        room_id: roomId,
        text: trimmed,
        type: "text",
        uid: user.uid,
        display_name: user.username || user.displayName || user.email,
        photo_url: user.photoURL || null,
        mentioned_usernames: mentionData.mentionedUsernames,
        mentioned_all: mentionData.mentionedAll,
      };

      if (replyTo) {
        messageData.reply_to = cleanReply(replyTo);
      }

      const { error: insertError } = await supabase.from("messages").insert(messageData);
      if (insertError) throw insertError;
      setText("");
      setMentionToken(null);
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

  const refreshMentionToken = () => {
    const cursor = inputRef.current?.selectionStart ?? text.length;
    setMentionToken(getMentionToken(text, cursor));
  };

  const handleTextChange = (e) => {
    const next = e.target.value;
    const cursor = e.target.selectionStart ?? next.length;
    setText(next);
    setMentionToken(getMentionToken(next, cursor));
  };

  const selectMention = (value) => {
    if (!mentionToken) return;
    const next = `${text.slice(0, mentionToken.start)}@${value} ${text.slice(mentionToken.end)}`;
    const nextCursor = mentionToken.start + value.length + 2;
    setText(next);
    setMentionToken(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleEnableNotifications = async () => {
    const permission = await requestWebsiteNotificationPermission();
    setNotificationPermission(permission || "unsupported");
  };

  const sendVoiceMessage = async (blob, mimeType, durationSeconds) => {
    if (!user || !blob.size) return;

    const contentType = normalizeVoiceMimeType(mimeType || blob.type);
    const extension = getVoiceExtension(contentType);
    const fileName = `voice-${Date.now()}.${extension}`;
    const filePath = `rooms/${roomId}/uploads/${user.uid}-${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(VOICE_BUCKET)
      .upload(filePath, blob, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(filePath);
    const mediaUrl = publicData.publicUrl;

    const messageData: Record<string, any> = {
      room_id: roomId,
      text: "Voice message",
      type: "voice",
      media_url: mediaUrl,
      file_name: fileName,
      file_mime_type: contentType,
      file_size: blob.size,
      duration_seconds: durationSeconds,
      uid: user.uid,
      display_name: user.username || user.displayName || user.email,
      photo_url: user.photoURL || null,
    };

    if (replyTo) {
      messageData.reply_to = cleanReply(replyTo);
    }

    const { error: insertError } = await supabase.from("messages").insert(messageData);
    if (insertError) throw insertError;
    setReplyTo(null);
  };

  const startVoiceRecording = async () => {
    if (!user || voiceState !== "idle") return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice messages are not supported in this browser.");
      return;
    }

    setError("");
    setShowEmojiPicker(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    recordingCancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mimeType = getVoiceMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const chunks = voiceChunksRef.current;
        const durationSeconds = recordingSecondsRef.current;
        voiceChunksRef.current = [];
        voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;

        if (recordingCancelledRef.current) return;

        if (!chunks.length) {
          setVoiceState("idle");
          setRecordingSeconds(0);
          recordingSecondsRef.current = 0;
          setError("No audio was recorded. Try again.");
          return;
        }

        const finalMimeType = normalizeVoiceMimeType(recorder.mimeType || mimeType);
        const blob = new Blob(chunks, { type: finalMimeType });

        try {
          await sendVoiceMessage(blob, finalMimeType, durationSeconds);
        } catch (err) {
          setError(getSendErrorMessage(err));
        } finally {
          setVoiceState("idle");
          setRecordingSeconds(0);
          recordingSecondsRef.current = 0;
        }
      };

      recorder.start();
      setVoiceState("recording");
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    } catch (err) {
      setVoiceState("idle");
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked. Please allow it and try again."
          : "Couldn't start voice recording. Try again."
      );
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  };

  const stopVoiceRecording = () => {
    if (voiceState !== "recording") return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setVoiceState("uploading");
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.requestData?.();
      mediaRecorderRef.current.stop();
    }
  };

  const handleVoiceButton = () => {
    if (voiceState === "recording") {
      stopVoiceRecording();
    } else if (voiceState === "idle") {
      startVoiceRecording();
    }
  };

  const handleReplyMessage = (message) => {
    if (!message) return;
    setReplyTo(cleanReply(message));
    setShowEmojiPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleStartEditMessage = (message) => {
    const canEdit = message.uid === user?.uid || isSystemAdmin;
    if (!canEdit) return;
    setEditingMessage(message);
    setEditText(message.text || "");
  };

  const handleSaveEditMessage = async (e) => {
    e.preventDefault();
    if (!editingMessage || savingEdit) return;

    const trimmed = editText.trim();
    if (!trimmed) return;

    const canEdit = editingMessage.uid === user?.uid || isSystemAdmin;
    if (!canEdit || !user) return;

    setSavingEdit(true);
    try {
      const { error: updateError } = await supabase
        .from("messages")
        .update({ text: trimmed, edited_at: new Date().toISOString() })
        .eq("id", editingMessage.id);
      if (updateError) throw updateError;
      setEditingMessage(null);
      setEditText("");
    } catch {
      alert("Couldn't edit this message. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = (message) => {
    const canDelete = message.uid === user?.uid || isSystemAdmin;
    if (!canDelete || deletingMessageId) return;

    setDeleteTarget(message);
    setDeleteError("");
  };

  const handleCancelDelete = () => {
    if (deletingMessageId) return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setDeletingMessageId(deleteTarget.id);
    setDeleteError("");
    try {
      const { error: deleteErr } = await supabase
        .from("messages")
        .delete()
        .eq("id", deleteTarget.id);
      if (deleteErr) throw deleteErr;
      setMessages((current) => current.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError("Couldn't delete this message. Please try again.");
    } finally {
      setDeletingMessageId("");
    }
  };

  const handleLeave = async () => {
    if (!user || !room) return;

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

      // leave_room handles removing the caller and deleting an empty room.
      const { error: rpcError } = await supabase.rpc("leave_room", { p_room_id: room.id });
      if (rpcError) throw rpcError;
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
              <p className="flex items-center gap-1.5 truncate text-xs text-textSecondary">
                {onlineCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                <span>{onlineCount} online</span>
              </p>
            </div>

            <div className="flex items-center gap-1 text-textSecondary">
              {(isAdmin || isSystemAdmin) && (
                <HeaderIconButton label="Manage room" onClick={() => setShowAdmin(true)}>
                  <GroupIcon />
                </HeaderIconButton>
              )}
              {notificationPermission === "default" && (
                <HeaderIconButton label="Enable notifications" onClick={handleEnableNotifications}>
                  <BellIcon />
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
              {!isAdmin && !isSystemAdmin && (
                <button
                  onClick={() => setShowPeople(true)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-textSecondary hover:bg-surfaceHover hover:text-textPrimary"
                >
                  Add people
                </button>
              )}
              {notificationPermission === "default" && (
                <button
                  onClick={handleEnableNotifications}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-textSecondary hover:bg-surfaceHover hover:text-textPrimary"
                >
                  Enable notifications
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
          {mentionToast && (
            <div className="pointer-events-none fixed right-3 top-24 z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-accent/35 bg-surface px-4 py-3 shadow-2xl shadow-black/30">
              <p className="text-sm font-semibold text-textPrimary">{mentionToast.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-textSecondary">{mentionToast.body}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-8">
            <div className="flex w-full flex-col gap-3">
              {visibleMessages.length === 0 && (
                <p className="mx-auto mt-10 rounded-full border border-border bg-surface px-4 py-2 text-center text-sm text-textSecondary">
                  No messages yet. Say something.
                </p>
              )}
              {visibleMessages.map((m) => {
                const isMessageOwner = m.uid === user.uid;
                const canEditOrDeleteMessage = isSystemAdmin || isMessageOwner;

                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isOwn={isMessageOwner}
                    canEdit={canEditOrDeleteMessage && m.type === "text"}
                    canDelete={canEditOrDeleteMessage && !["system", "call"].includes(m.type)}
                    seenBy={(readProfilesByMessage[m.id] || []).filter((profile) => profile.uid !== m.uid)}
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
                    <p className="line-clamp-2 text-xs text-textSecondary">{replyTo.type === "image" ? "Photo" : replyTo.type === "video" ? "Video" : replyTo.type === "voice" ? "Voice message" : replyTo.text || "Message"}</p>
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



              {voiceState !== "idle" && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-surface px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${voiceState === "recording" ? "animate-pulse bg-red-400" : "bg-accent"}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-textPrimary">
                        {voiceState === "recording" ? "Recording voice message" : "Sending voice message"}
                      </p>
                      <p className="text-xs text-textSecondary">{formatRecordingTime(recordingSeconds)}</p>
                    </div>
                  </div>
                  {voiceState === "recording" && (
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400"
                    >
                      Stop
                    </button>
                  )}
                </div>
              )}

              {error && <p className="mb-2 px-2 text-xs text-red-400">{error}</p>}

              {mentionSuggestions.length > 0 && (
                <div className="absolute bottom-[4.75rem] left-16 z-20 w-[min(18rem,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30 sm:bottom-[4.25rem] sm:left-20">
                  {mentionSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.type}-${suggestion.value}`}
                      type="button"
                      onClick={() => selectMention(suggestion.value)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-surfaceHover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-textPrimary">
                          {suggestion.label}
                        </span>
                        <span className="block truncate text-xs text-textSecondary">
                          {suggestion.subtitle}
                        </span>
                      </span>
                      {suggestion.type === "everyone" && (
                        <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                          all
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">


                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((open) => !open)}
                  disabled={voiceState !== "idle"}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg text-textSecondary transition hover:border-accent/50 hover:bg-surfaceHover hover:text-textPrimary active:scale-[0.97]"
                  aria-label="Open emoji picker"
                  title="Emoji"
                >
                  😊
                </button>

                <button
                  type="button"
                  onClick={handleVoiceButton}
                  disabled={voiceState === "uploading" || sending}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.97] disabled:opacity-50 ${
                    voiceState === "recording"
                      ? "border-red-400/60 bg-red-500 text-white shadow-lg shadow-red-950/20"
                      : "border-border bg-surface text-textSecondary hover:border-accent/50 hover:bg-surfaceHover hover:text-accent"
                  }`}
                  aria-label={voiceState === "recording" ? "Stop voice recording" : "Record voice message"}
                  title={voiceState === "recording" ? "Stop recording" : "Voice message"}
                >
                  {voiceState === "uploading" ? <SpinnerIcon /> : voiceState === "recording" ? <StopIcon /> : <MicIcon />}
                </button>

                <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-[24px] border border-border bg-surface px-4 text-textPrimary shadow-inner">
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyUp={refreshMentionToken}
                    onClick={refreshMentionToken}
                    placeholder="Message"
                    disabled={voiceState !== "idle"}
                    rows={1}
                    className="max-h-32 min-h-[24px] w-full resize-none bg-transparent py-3 text-[15px] leading-6 placeholder:text-textSecondary focus:outline-none disabled:opacity-60"
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
                  disabled={!text.trim() || sending || voiceState !== "idle"}
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
      {showPeople && room && (
        <RoomPeoplePanel
          room={room}
          profiles={memberProfiles}
          onClose={() => setShowPeople(false)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-red-400/25 bg-surface shadow-2xl shadow-black/40">
            <div className="border-b border-border bg-gradient-to-br from-red-500/14 via-surface to-surface px-6 py-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-red-400/30 bg-red-500/12 text-red-300">
                <TrashIcon />
              </div>
              <h2 className="font-display text-lg font-semibold text-textPrimary">Delete this message?</h2>
              <p className="mt-2 text-sm leading-6 text-textSecondary">
                This message will be removed from the room for everyone. This action cannot be undone.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="mb-4 max-h-28 overflow-y-auto rounded-xl border border-border bg-bg/70 px-3 py-2 text-sm text-textSecondary">
                {deleteTarget.text || (deleteTarget.type === "image" ? "Photo message" : deleteTarget.type === "video" ? "Video message" : "Message")}
              </div>
              {deleteError && <p className="mb-4 text-xs text-red-400">{deleteError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={!!deletingMessageId}
                  className="rounded-lg px-3 py-2 text-sm text-textSecondary transition hover:bg-surfaceHover hover:text-textPrimary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={!!deletingMessageId}
                  className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-red-950/20 transition hover:bg-red-400 disabled:opacity-50"
                >
                  {deletingMessageId ? "Deleting..." : "Delete message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

function BellIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function MicIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 0 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 10.5v.7a6.5 6.5 0 0 0 13 0v-.7M12 17.8V21M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
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

function TrashIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 6l1 14h9l1-14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
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
