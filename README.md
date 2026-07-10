# PriChat — Realtime Chat (Next.js + Supabase)

A fully working multi-user chat app: email/password and Google sign-in, multiple
chat rooms, realtime messaging, voice messages, audio/video calls, and basic
presence — built with Next.js (App Router), Tailwind CSS, and Supabase
(Auth + Postgres + Realtime + Storage).

## What's included

- Email/password and Google OAuth sign-in (Supabase Auth)
- Create rooms with three privacy levels: **public**, **passcode**, or **admin approval**
- Find any room — including private ones — by pasting its room ID ("Join by ID")
- Per-room admins: the creator starts as admin and can promote/demote other members,
  remove members, add someone directly by their account email, and approve or deny
  join requests
- Realtime messages (Supabase Realtime `postgres_changes`, no refresh needed)
- Voice messages (recorded in-browser, stored in Supabase Storage)
- Audio/video calls with WebRTC signaling over Supabase tables
- Emoji picker inside the message input
- Message editing and deletion for the sender and room admins
- Show/hide toggle on every password and passcode field
- Basic presence (online dot + "last seen" heartbeat)
- Responsive layout with a collapsible sidebar on mobile
- Route protection (redirects to `/login` if signed out)

## 1. Install dependencies

```bash
npm install
```

## 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. In **Authentication → Providers**, enable:
   - **Email** (for parity with the old app, turn **Confirm email** off under
     Authentication → Providers → Email so new sign-ups are logged in immediately)
   - **Google** (add your Google OAuth client ID/secret)
3. In **Project Settings → API**, copy the **Project URL** and the **anon/public**
   (a.k.a. publishable) API key.

## 3. Add your Supabase config

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-publishable-key>
```

Both are prefixed `NEXT_PUBLIC_` because they're needed in the browser — this is
normal and safe for the Supabase anon key. Your **Row Level Security (RLS)**
policies are what actually protect your data, not these keys being hidden.

## 4. Apply the database schema

Open **SQL Editor** in the Supabase dashboard and run the contents of
[`supabase/schema.sql`](supabase/schema.sql). It's idempotent, so you can re-run
it safely. It creates:

- Tables: `profiles`, `rooms`, `messages`, `join_requests`, `calls`,
  `call_participants`, `call_peers`, `call_ice_candidates`
- Security-definer helper functions (`is_system_admin`, `is_room_member`,
  `is_room_admin`, `is_call_member`)
- Membership RPCs (`join_room`, `join_room_as_admin`, `leave_room`) so non-admins
  can self-join / self-leave while direct room updates stay admin-only
- A trigger that auto-creates a `profiles` row when a user signs up
- Row Level Security policies on every table
- The realtime publication for all live tables
- A public `voice` Storage bucket (for voice-message uploads) and its policies

What the RLS model enforces:

- Only signed-in users can read or write anything.
- A room's **members** array is the access gate for its messages, calls, and
  participants. Admins manage membership freely; non-admins can only add or
  remove *themselves*, and only through the `join_room` / `leave_room` RPCs.
- Public and passcode rooms let any signed-in user join (passcode verified by a
  server-side hash comparison inside `join_room`). Approval rooms require an admin
  to move a request from `join_requests` into `members`.
- Only people in a room's `admins` array (or the system admin) can promote/demote,
  remove members, rename or delete the room, or manage join requests.
- Messages can be edited/deleted by their sender or a room admin.

**Security note on passcodes:** the passcode itself is never stored — only its
SHA-256 hash, computed in the browser. Unlike the old Firestore build, the
passcode is now verified **server-side** inside the `join_room` RPC (a security
definer function), so the client can't bypass the check by talking to the API
directly.

The **system admin** email is defined in
[`src/lib/systemAdmin.js`](src/lib/systemAdmin.js) and mirrored in
`schema.sql` (`is_system_admin()`). Change both if you want a different system
admin account.

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
the same `NEXT_PUBLIC_SUPABASE_*` environment variables in the project settings.

In the Supabase dashboard under **Authentication → URL Configuration**, add your
production domain (and Vercel preview domains) to the redirect allow-list so
Google sign-in works there too.

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
      [roomId]/page.js        A single room: messages, input, calls, admin entry
  components/
    Sidebar.jsx              Your rooms, public room discovery, create/join, logout
    CreateRoomModal.jsx       New room form (name + privacy type)
    JoinRoomModal.jsx         Find a room by ID and join it (public/passcode/approval)
    RoomAdminPanel.jsx        Manage members, promote/demote, approve requests
    CallPanel.jsx            Audio/video calls (WebRTC signaling over Supabase)
    PasswordInput.jsx          Reusable show/hide password field
    MessageBubble.jsx        Single message UI
  context/
    AuthContext.jsx           Supabase auth state + actions
  lib/
    supabase.js               Supabase browser client
    mappers.js                snake_case row -> camelCase UI shape helpers
    hash.js                    SHA-256 helper for passcodes (Web Crypto API)
    systemAdmin.js             System admin email + helper
supabase/
  schema.sql                 Full database schema, RLS, RPCs, realtime, storage
```

## How room privacy works

Every room has a `privacy` value of `public`, `passcode`, or `approval`, plus
an `admins` array and a `members` array (the creator starts in both).

- **Public** — anyone signed in can join with one click, from the sidebar's
  "Discover public rooms" list or by pasting the ID into "Join by ID."
- **Passcode** — the creator sets a code when creating the room. Joiners paste
  the room ID into "Join by ID," then enter the code (verified server-side).
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
