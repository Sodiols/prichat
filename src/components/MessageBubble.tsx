/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useRef, useState } from "react";
import UserAvatar from "./UserAvatar";

function formatTime(message) {
  const value = message.createdAt;
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "sending…";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 1) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 1) return `${rest}s`;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function previewText(message) {
  if (!message) return "";
  if (message.type === "image") return message.text || "Photo";
  if (message.type === "video") return message.text || "Video";
  if (message.type === "voice") return "Voice message";
  return message.text || "Message";
}

export default function MessageBubble({
  message,
  isOwn,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  deleting,
}) {
  const time = formatTime(message);
  const wasEdited = !!message.editedAt;
  const senderName = isOwn ? "You" : message.displayName || "Member";
  const hasMedia = !!message.mediaUrl && ["image", "video", "voice"].includes(message.type);

  if (message.type === "system" || message.type === "call") {
    const eventType = message.metadata?.eventType || "";
    const duration = formatDuration(message.durationSeconds || message.metadata?.durationSeconds || 0);
    return (
      <div className="flex w-full justify-center px-2 py-1">
        <div className="max-w-[92%] rounded-full border border-border bg-surface/80 px-3 py-1.5 text-center text-xs text-textSecondary shadow-sm">
          <span className={message.type === "call" ? "text-accent" : "text-textPrimary"}>
            {message.text}
          </span>
          {duration && eventType === "call_ended" && (
            <span className="ml-1 text-textSecondary">({duration})</span>
          )}
          <span className="ml-2 text-[10px] text-textSecondary/80">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex w-full items-end gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn && (
        <UserAvatar name={message.displayName} photoURL={message.photoURL} size="sm" />
      )}

      <div className={`flex max-w-[68%] sm:max-w-[70%] lg:max-w-[58%] flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && <span className="px-1 text-[11px] text-textSecondary">{senderName}</span>}

        <div className={`flex items-end gap-1.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          <div
            className={`relative overflow-hidden rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
              isOwn
                ? "rounded-br-sm bg-accent text-bg"
                : "rounded-bl-sm border border-border bg-surface text-textPrimary"
            }`}
          >
            {message.replyTo && (
              <div
                className={`mb-2 max-w-[260px] rounded-xl border-l-4 px-3 py-2 text-xs ${
                  isOwn
                    ? "border-bg/45 bg-bg/10 text-bg/80"
                    : "border-accent bg-bg/70 text-textSecondary"
                }`}
              >
                <p className={isOwn ? "mb-0.5 truncate font-semibold text-bg" : "mb-0.5 truncate font-semibold text-accent"}>
                  {message.replyTo.uid === message.uid ? senderName : message.replyTo.displayName || "Member"}
                </p>
                <p className="line-clamp-2 break-words opacity-85">{previewText(message.replyTo)}</p>
              </div>
            )}

            {message.type === "image" && message.mediaUrl && (
              <img
                src={message.mediaUrl}
                alt={message.fileName || "Uploaded image"}
                className="mb-2 max-h-80 w-full min-w-[180px] rounded-xl object-cover"
                loading="lazy"
              />
            )}

            {message.type === "video" && message.mediaUrl && (
              <video
                src={message.mediaUrl}
                controls
                className="mb-2 max-h-80 w-full min-w-[220px] rounded-xl bg-black"
              />
            )}

            {message.type === "voice" && message.mediaUrl && (
              <VoiceMessage message={message} isOwn={isOwn} />
            )}

            {message.text && message.type !== "voice" && (
              <p className={`whitespace-pre-wrap break-words ${hasMedia ? "pr-12" : "pr-10"}`}>{message.text}</p>
            )}

            <span className={`float-right ml-3 mt-1 text-[10px] ${isOwn ? "text-bg/60" : "text-textSecondary"}`}>
              {time}{wasEdited ? " · edited" : ""}
            </span>
          </div>

          <div className={`flex gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            <button
              type="button"
              onClick={() => onReply?.(message)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-textSecondary opacity-100 transition hover:border-accent/50 hover:bg-surfaceHover hover:text-accent sm:opacity-0 sm:group-hover:opacity-100"
              aria-label={`Reply to ${senderName}`}
              title="Reply"
            >
              <ReplyIcon />
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit?.(message)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-textSecondary opacity-100 transition hover:border-accent/50 hover:bg-surfaceHover hover:text-accent sm:opacity-0 sm:group-hover:opacity-100"
                title="Edit message"
                aria-label="Edit message"
              >
                <EditIcon />
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete?.(message)}
                disabled={deleting}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-textSecondary opacity-100 transition hover:border-red-400/50 hover:bg-surfaceHover hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-40"
                title="Delete message"
                aria-label="Delete message"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {isOwn && (
        <UserAvatar name={message.displayName || "You"} photoURL={message.photoURL} size="sm" />
      )}
    </div>
  );
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 8L6 12L10 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 12H14.5C17.2 12 19 13.8 19 16.5V17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 6l1 14h9l1-14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

// Deterministic waveform heights derived from the message id, so each voice
// message keeps a stable, unique-looking waveform between renders.
function waveformBars(seed, count = 30) {
  let h = 2166136261;
  const source = seed || "voice";
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const bars = [];
  for (let i = 0; i < count; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    bars.push(0.28 + (h % 1000) / 1000 * 0.72); // 0.28 .. 1.0
  }
  return bars;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function VoiceMessage({ message, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);

  const bars = useMemo(
    () => waveformBars(message.id || message.mediaUrl),
    [message.id, message.mediaUrl]
  );

  // MediaRecorder webm often reports an Infinity duration, so fall back to the
  // length we captured while recording.
  const duration =
    Number.isFinite(loadedDuration) && loadedDuration > 0
      ? loadedDuration
      : message.durationSeconds || 0;
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const next = ratio * duration;
    el.currentTime = next;
    setCurrent(next);
  };

  const playBtn = isOwn ? "bg-bg text-accent" : "bg-accent text-bg";
  const barActive = isOwn ? "bg-bg" : "bg-accent";
  const barInactive = isOwn ? "bg-bg/25" : "bg-textSecondary/35";
  const timeText = isOwn ? "text-bg/70" : "text-textSecondary";

  return (
    <div
      className={`mb-2 flex min-w-[236px] max-w-[280px] items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
        isOwn ? "bg-bg/10" : "bg-bg/60"
      }`}
    >
      <audio
        ref={audioRef}
        src={message.mediaUrl}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLoadedDuration(e.currentTarget.duration)}
      />

      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm transition active:scale-95 ${playBtn}`}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <button
        type="button"
        onClick={seek}
        className="flex h-8 flex-1 items-center gap-[2px]"
        aria-label="Seek within voice message"
      >
        {bars.map((height, i) => {
          const active = i / bars.length < progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${active ? barActive : barInactive}`}
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          );
        })}
      </button>

      <span className={`shrink-0 text-[11px] tabular-nums ${timeText}`}>
        {formatClock(playing || current > 0 ? current : duration)}
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
    </svg>
  );
}
