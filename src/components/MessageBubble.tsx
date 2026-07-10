/* eslint-disable @next/next/no-img-element */
"use client";

import UserAvatar from "./UserAvatar";

function formatTime(message) {
  const value = message.createdAt;
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "sending…";
}

function previewText(message) {
  if (!message) return "";
  if (message.type === "image") return message.text || "Photo";
  if (message.type === "video") return message.text || "Video";
  if (message.type === "voice") return "Voice message";
  return message.text || "Message";
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
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
              <div className={`mb-2 min-w-[220px] rounded-xl border px-3 py-2 ${
                isOwn ? "border-bg/20 bg-bg/10" : "border-border bg-bg/70"
              }`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className={isOwn ? "text-xs font-medium text-bg" : "text-xs font-medium text-textPrimary"}>
                    Voice message
                  </span>
                  {message.durationSeconds ? (
                    <span className={isOwn ? "text-[11px] text-bg/65" : "text-[11px] text-textSecondary"}>
                      {formatDuration(message.durationSeconds)}
                    </span>
                  ) : null}
                </div>
                <audio src={message.mediaUrl} controls preload="metadata" className="h-9 w-full min-w-0" />
              </div>
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
