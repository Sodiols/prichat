// Maps snake_case Postgres rows (from queries and realtime payloads) into the
// camelCase shape the UI components already expect. Timestamps become Date
// objects so existing time formatting/sorting keeps working.

import type {
  Call,
  JoinRequest,
  Message,
  Participant,
  Profile,
  Room,
} from "./types";

type Row = Record<string, any>;

const toDate = (value: any): Date | null => (value ? new Date(value) : null);

export function mapProfile(row: Row | null | undefined): Profile | null {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.id,
    username: row.username || null,
    displayName: row.display_name || "Member",
    email: row.email || null,
    photoURL: row.photo_url || null,
    lastSeen: toDate(row.last_seen),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapRoom(row: Row | null | undefined): Room | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    photoURL: row.photo_url || null,
    privacy: row.privacy,
    passcodeHash: row.passcode_hash || null,
    createdBy: row.created_by,
    admins: row.admins || [],
    members: row.members || [],
    createdAt: toDate(row.created_at),
  };
}

export function mapMessage(row: Row | null | undefined): Message | null {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    text: row.text || "",
    type: row.type || "text",
    uid: row.uid,
    displayName: row.display_name || "",
    photoURL: row.photo_url || null,
    mediaUrl: row.media_url || null,
    fileName: row.file_name || null,
    fileMimeType: row.file_mime_type || null,
    fileSize: row.file_size || null,
    durationSeconds: row.duration_seconds || null,
    replyTo: row.reply_to || null,
    metadata: row.metadata || {},
    mentionedUsernames: row.mentioned_usernames || [],
    mentionedAll: !!row.mentioned_all,
    createdAt: toDate(row.created_at),
    editedAt: toDate(row.edited_at),
  };
}

export function mapJoinRequest(row: Row | null | undefined): JoinRequest | null {
  if (!row) return null;
  return {
    id: row.uid,
    uid: row.uid,
    roomId: row.room_id,
    displayName: row.display_name || "Member",
    photoURL: row.photo_url || null,
    requestedAt: toDate(row.requested_at),
  };
}

export function mapCall(row: Row | null | undefined): Call | null {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name || null,
    type: row.type,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    endedBy: row.ended_by || null,
    endedAt: toDate(row.ended_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapParticipant(row: Row | null | undefined): Participant | null {
  if (!row) return null;
  return {
    id: row.uid,
    uid: row.uid,
    callId: row.call_id,
    displayName: row.display_name || "Member",
    photoURL: row.photo_url || null,
    hidden: !!row.hidden,
    role: row.role || "normal",
    muted: !!row.muted,
    cameraOff: !!row.camera_off,
    screenSharing: !!row.screen_sharing,
    joinedAt: toDate(row.joined_at),
    leftAt: toDate(row.left_at),
  };
}
