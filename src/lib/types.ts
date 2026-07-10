// Shared domain types used across the app. These describe the camelCase shapes
// produced by the mappers in ./mappers.ts (not the raw Postgres rows).

export type RoomPrivacy = "public" | "passcode" | "approval";
export type MessageType = "text" | "image" | "video" | "voice";
export type CallType = "audio" | "video";
export type CallStatus = "active" | "ended";

export interface Profile {
  id: string;
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  lastSeen: Date | null;
  updatedAt?: Date | null;
}

export interface AppUser {
  uid: string;
  id: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
}

export interface Room {
  id: string;
  name: string;
  privacy: RoomPrivacy;
  passcodeHash: string | null;
  createdBy: string;
  admins: string[];
  members: string[];
  createdAt: Date | null;
}

export interface ReplyPreview {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  type: string;
  mediaUrl: string | null;
  photoURL: string | null;
}

export interface Message {
  id: string;
  roomId: string;
  text: string;
  type: MessageType;
  uid: string;
  displayName: string;
  photoURL: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  replyTo: ReplyPreview | null;
  createdAt: Date | null;
  editedAt: Date | null;
}

export interface JoinRequest {
  id: string;
  uid: string;
  roomId: string;
  displayName: string;
  photoURL: string | null;
  requestedAt: Date | null;
}

export interface Call {
  id: string;
  roomId: string;
  roomName: string | null;
  type: CallType;
  status: CallStatus;
  createdBy: string;
  createdByName: string | null;
  endedBy: string | null;
  endedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Participant {
  id: string;
  uid: string;
  callId: string;
  displayName: string;
  photoURL: string | null;
  hidden: boolean;
  role: string;
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
}

export interface AuthContextValue {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  signup: (email: string, password: string, displayName: string) => Promise<unknown>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<unknown>;
  updateMyProfile: (input: { displayName: string; photoURL?: string | null }) => Promise<void>;
}
