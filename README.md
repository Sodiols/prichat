# PriChat — Realtime Chat (Next.js + Firebase)

A fully working multi-user chat app: email/password and Google sign-in, multiple
chat rooms, realtime messaging, and basic presence — built with Next.js (App Router),
Tailwind CSS, and Firebase (Auth + Firestore).

## What's included

- Email/password and Google OAuth sign-in (Firebase Auth)
- Create rooms with three privacy levels: **public**, **passcode**, or **admin approval**
- Find any room — including private ones — by pasting its room ID ("Join by ID")
- Per-room admins: the creator starts as admin and can promote/demote other members,
  remove members, add someone directly by their account email, and approve or deny
  join requests
- Realtime messages (Firestore `onSnapshot`, no refresh needed)
- Emoji picker inside the message input
- Message deletion for the sender and room admins
- Show/hide toggle on every password and passcode field
- Basic presence (online dot + "last seen" heartbeat)
- Responsive layout with a collapsible sidebar on mobile
- Route protection (redirects to `/login` if signed out)

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. In **Build → Authentication → Sign-in method**, enable:
   - **Email/Password**
   - **Google**
3. In **Build → Firestore Database**, click **Create database** and start in **production mode**.
4. In **Project settings → General**, scroll to "Your apps", click the **Web** icon
   (`</>`) to register a web app, and copy the config values it gives you.

## 3. Add your Firebase config

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` with the values from step 2:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

These are all prefixed `NEXT_PUBLIC_` because they're needed in the browser —
this is normal and safe for Firebase client config (your Firestore **security rules**
are what actually protect your data, not these keys being hidden).

## 4. Set Firestore security rules

In the Firebase console, go to **Firestore Database → Rules** and paste this in. I also included the same rules in `firestore.rules` for easier copying:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /rooms/{roomId} {
      // Room metadata (name, privacy type, member/admin lists, and the
      // passcode's hash) is readable by any signed-in user, so "Join by ID"
      // can look a room up before you're a member. Message content below is
      // still locked to members only.
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.admins == [request.auth.uid]
        && request.resource.data.members == [request.auth.uid];

      allow update: if request.auth != null && (
        request.auth.uid in resource.data.admins ||
        isSelfJoin() ||
        isSelfLeave()
      );

      allow delete: if request.auth != null && request.auth.uid in resource.data.admins;

      function isSelfJoin() {
        return resource.data.privacy in ["public", "passcode"]
          && request.resource.data.members.hasAll(resource.data.members)
          && request.resource.data.members.hasAny([request.auth.uid])
          && request.resource.data.members.size() == resource.data.members.size() + 1
          && request.resource.data.admins == resource.data.admins
          && request.resource.data.name == resource.data.name
          && request.resource.data.privacy == resource.data.privacy;
      }

      function isSelfLeave() {
        return resource.data.members.hasAny([request.auth.uid])
          && !request.resource.data.members.hasAny([request.auth.uid])
          && resource.data.members.hasAll(request.resource.data.members)
          && request.resource.data.members.size() == resource.data.members.size() - 1
          && request.resource.data.admins == resource.data.admins
          && request.resource.data.name == resource.data.name
          && request.resource.data.privacy == resource.data.privacy;
      }

      match /joinRequests/{uid} {
        allow create: if request.auth != null
          && request.auth.uid == uid
          && request.resource.data.uid == request.auth.uid;
        allow read: if request.auth != null && (
          request.auth.uid == uid ||
          request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.admins
        );
        allow delete: if request.auth != null && (
          request.auth.uid == uid ||
          request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.admins
        );
      }

      match /messages/{messageId} {
        allow read: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.members;
        allow create: if request.auth != null
          && request.auth.uid == request.resource.data.uid
          && request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.members;
        allow update: if false;
        allow delete: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.members
          && (
            request.auth.uid == resource.data.uid ||
            request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.admins
          );
      }
    }
  }
}
```

What this enforces:

- Only signed-in users can read or write anything.
- A room's **members** array is the actual access gate for its messages — admins
  manage it freely; non-admins can only add or remove *themselves*.
- Public and passcode rooms let any signed-in user add themselves to `members`.
  Approval rooms don't — joining requires an admin to move you from
  `joinRequests` into `members`.
- Only people in a room's `admins` array can promote/demote, remove members,
  delete the room, or manage join requests.
- Messages can be deleted by their sender or by a room admin. Editing stays disabled.

**Security note on passcodes:** the passcode itself is never stored — only its
SHA-256 hash, computed in the browser. The app verifies passcodes client-side
(your browser hashes what you type and compares it to the stored hash) rather
than in the security rules, because Firestore rules can't run a hash
comparison against arbitrary input. This means someone bypassing the UI and
talking to the Firestore API directly could theoretically add themselves to a
passcode room without knowing the code — same as most client-side passcode
gates without a backend. If you need that fully airtight, the join logic
should move into a Cloud Function that verifies the passcode server-side
before touching `members`. For a personal or small-team chat app this
client-side check is a reasonable trade-off.

## 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account (or sign in
with Google), make a room, and open the same room in a second browser/incognito
window with a second account to see messages arrive in realtime.

## 6. Deploy

This is a standard Next.js app, so it deploys cleanly to
[Vercel](https://vercel.com): push to a Git repo, import it in Vercel, and add
the same `NEXT_PUBLIC_FIREBASE_*` environment variables in the project settings.

Also, in the Firebase console under **Authentication → Settings → Authorized domains**,
add your production domain (and Vercel preview domain) so sign-in works there too.

## Project structure

```
src/
  app/
    layout.js              Root layout, fonts, AuthProvider
    page.js                 Redirects to /chat or /login
    login/page.js            Sign in / sign up screen
    chat/
      layout.js              Auth guard + sidebar shell
      page.js                 Empty state ("pick a room")
      [roomId]/page.js        A single room: messages, input, admin entry point
  components/
    Sidebar.jsx              Your rooms, public room discovery, create/join, logout
    CreateRoomModal.jsx       New room form (name + privacy type)
    JoinRoomModal.jsx         Find a room by ID and join it (public/passcode/approval)
    RoomAdminPanel.jsx        Manage members, promote/demote, approve requests
    PasswordInput.jsx          Reusable show/hide password field
    MessageBubble.jsx        Single message UI
  context/
    AuthContext.jsx           Firebase auth state + actions
  lib/
    firebase.js               Firebase app/auth/db init
    hash.js                    SHA-256 helper for passcodes (Web Crypto API)
```

## How room privacy works

Every room has a `privacy` value of `public`, `passcode`, or `approval`, plus
an `admins` array and a `members` array (the creator starts in both).

- **Public** — anyone signed in can join with one click, from the sidebar's
  "Discover public rooms" list or by pasting the ID into "Join by ID."
- **Passcode** — the creator sets a code when creating the room. Joiners paste
  the room ID into "Join by ID," then enter the code.
- **Admin approval** — joiners paste the room ID, send a request, and wait.
  Admins see pending requests in the room's "Manage" panel and approve or deny.

Inside any room you admin, the **Manage** button opens a panel where you can
promote a member to admin, demote an admin back to member (a room always
needs at least one admin), remove someone entirely, or add someone directly
by typing their account email.

Anyone can **leave** a room at any time from the **Leave** button in the room
header. If you're the room's only admin and other members are still in it,
you'll be asked to promote someone first so the room doesn't end up
unmanaged. If you're the last person in the room, leaving deletes it.

## Extending it

- **A real cross-app friends list**: this build treats "who's in a room" as
  per-room membership managed by that room's admin. A separate global friends
  system (friend requests, a persistent contacts list, "invite a friend" from
  any room) would be its own `friends/{uid}/list` collection plus its own UI.
- **Typing indicators**: write a `typing/{uid}` doc per room with a timestamp, debounce on keypress, and clear it after a few seconds of inactivity.
- **Read receipts**: store `lastReadAt` per user per room and compare against message timestamps.
- **File/image sharing**: add Firebase Storage, upload on file select, and store the resulting URL on the message doc.
- **Server-verified passcodes**: move the passcode check into a Cloud Function for the airtight version described in the security note above.
