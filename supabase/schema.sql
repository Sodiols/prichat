-- =============================================================================
-- PriChat — Supabase schema (replaces Firebase Auth + Firestore + Storage)
-- Run this in the Supabase SQL editor for project vuljygbavnalsprsolgz.
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- One row per auth user. Mirrors the old Firestore "users" collection.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Member',
  email        text,
  photo_url    text,
  last_seen    timestamptz default now(),
  updated_at   timestamptz default now(),
  created_at   timestamptz default now()
);

create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  privacy       text not null default 'public' check (privacy in ('public', 'passcode', 'approval')),
  passcode_hash text,
  created_by    uuid not null,
  admins        uuid[] not null default '{}',
  members       uuid[] not null default '{}',
  created_at    timestamptz default now()
);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms (id) on delete cascade,
  text             text not null default '',
  type             text not null default 'text' check (type in ('text', 'image', 'video', 'voice')),
  uid              uuid not null,
  display_name     text,
  photo_url        text,
  media_url        text,
  file_name        text,
  file_mime_type   text,
  file_size        bigint,
  duration_seconds integer,
  reply_to         jsonb,
  created_at       timestamptz default now(),
  edited_at        timestamptz
);
create index if not exists messages_room_created_idx on public.messages (room_id, created_at);

create table if not exists public.join_requests (
  room_id      uuid not null references public.rooms (id) on delete cascade,
  uid          uuid not null,
  display_name text,
  photo_url    text,
  requested_at timestamptz default now(),
  primary key (room_id, uid)
);

create table if not exists public.calls (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms (id) on delete cascade,
  room_name       text,
  type            text not null check (type in ('audio', 'video')),
  status          text not null default 'active' check (status in ('active', 'ended')),
  created_by      uuid not null,
  created_by_name text,
  ended_by        uuid,
  ended_at        timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists calls_room_status_idx on public.calls (room_id, status);

create table if not exists public.call_participants (
  call_id        uuid not null references public.calls (id) on delete cascade,
  uid            uuid not null,
  display_name   text,
  photo_url      text,
  hidden         boolean default false,
  role           text default 'normal',
  muted          boolean default false,
  camera_off     boolean default false,
  screen_sharing boolean default false,
  joined_at      timestamptz default now(),
  left_at        timestamptz,
  updated_at     timestamptz default now(),
  primary key (call_id, uid)
);

-- WebRTC signaling: one row per pair of peers in a call.
create table if not exists public.call_peers (
  call_id      uuid not null references public.calls (id) on delete cascade,
  pair_id      text not null,
  offer        jsonb,
  answer       jsonb,
  offerer_uid  uuid,
  answerer_uid uuid,
  updated_at   timestamptz default now(),
  primary key (call_id, pair_id)
);

-- WebRTC ICE candidates (append-only).
create table if not exists public.call_ice_candidates (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid not null references public.calls (id) on delete cascade,
  pair_id    text not null,
  kind       text not null check (kind in ('offer', 'answer')),
  candidate  jsonb not null,
  created_at timestamptz default now()
);
create index if not exists ice_pair_idx on public.call_ice_candidates (call_id, pair_id, kind);

-- -----------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies avoid recursion)
-- -----------------------------------------------------------------------------

create or replace function public.is_system_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'email') = 'itssayem2023@gmail.com', false);
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1 from public.rooms r
    where r.id = p_room_id
      and (auth.uid() = any (r.members) or auth.uid() = any (r.admins))
  );
$$;

create or replace function public.is_room_admin(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1 from public.rooms r
    where r.id = p_room_id and auth.uid() = any (r.admins)
  );
$$;

create or replace function public.is_call_member(p_call_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1
    from public.calls c
    join public.rooms r on r.id = c.room_id
    where c.id = p_call_id
      and (auth.uid() = any (r.members) or auth.uid() = any (r.admins))
  );
$$;

create or replace function public.end_call_if_empty(p_call_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_call_member(p_call_id) then
    raise exception 'Not allowed';
  end if;

  update public.calls c
    set status = 'ended',
        ended_by = auth.uid(),
        ended_at = now(),
        updated_at = now()
  where c.id = p_call_id
    and c.status = 'active'
    and not exists (
      select 1
      from public.call_participants cp
      where cp.call_id = c.id
        and cp.left_at is null
    );

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Membership RPCs (security definer): let non-admins self-join / self-leave
-- while keeping direct UPDATE on rooms restricted to admins.
-- -----------------------------------------------------------------------------

-- Public: instant join. Passcode: join only when hash matches. Approval:
-- normal users must use a join request (blocked here); system admin bypasses.
create or replace function public.join_room(p_room_id uuid, p_passcode_hash text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found';
  end if;

  if not (public.is_system_admin() or r.privacy = 'public') then
    if r.privacy = 'passcode' then
      if p_passcode_hash is null or p_passcode_hash <> coalesce(r.passcode_hash, '') then
        raise exception 'Incorrect passcode';
      end if;
    else
      raise exception 'This room requires admin approval';
    end if;
  end if;

  update public.rooms
    set members = (
      select array(select distinct unnest(members || auth.uid()))
    )
  where id = p_room_id;
end;
$$;

-- System-admin only: join a room directly as an admin.
create or replace function public.join_room_as_admin(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Only the system admin can join as admin';
  end if;

  update public.rooms
    set admins = (select array(select distinct unnest(admins || auth.uid())))
  where id = p_room_id;
end;
$$;

-- Remove the caller from a room. Deletes the room when nobody is left.
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.rooms;
  remaining uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;

  remaining := array(select unnest(r.members) except select auth.uid());

  if array_length(remaining, 1) is null then
    delete from public.rooms where id = p_room_id;
  else
    update public.rooms
      set members = remaining,
          admins  = array(select unnest(admins) except select auth.uid())
    where id = p_room_id;
  end if;
end;
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, photo_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1),
      'Member'
    ),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Grants
-- Supabase talks to Postgres as the anon / authenticated / service_role roles.
-- Those roles need table-level privileges before RLS is even consulted; without
-- these grants every query fails with "permission denied for table ..." (42501),
-- which is what makes the whole app look broken. RLS below still restricts rows.
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Anything created in public later gets the same grants automatically.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.messages            enable row level security;
alter table public.join_requests       enable row level security;
alter table public.calls               enable row level security;
alter table public.call_participants   enable row level security;
alter table public.call_peers          enable row level security;
alter table public.call_ice_candidates enable row level security;

-- profiles ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- rooms ------------------------------------------------------------------------
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (true);

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and admins = array[auth.uid()]::uuid[]
    and members = array[auth.uid()]::uuid[]
  );

-- Direct updates are limited to admins / system admin. Self-join and self-leave
-- go through the join_room / leave_room RPCs above.
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update to authenticated
  using (public.is_room_admin(id))
  with check (public.is_room_admin(id));

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms
  for delete to authenticated using (public.is_room_admin(id));

-- messages ---------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (uid = auth.uid() and public.is_room_member(room_id));

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_room_member(room_id) and (uid = auth.uid() or public.is_system_admin()))
  with check (public.is_room_member(room_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_room_member(room_id) and (uid = auth.uid() or public.is_system_admin()));

-- join_requests ----------------------------------------------------------------
drop policy if exists join_requests_select on public.join_requests;
create policy join_requests_select on public.join_requests
  for select to authenticated
  using (uid = auth.uid() or public.is_room_admin(room_id));

drop policy if exists join_requests_insert on public.join_requests;
create policy join_requests_insert on public.join_requests
  for insert to authenticated with check (uid = auth.uid());

drop policy if exists join_requests_delete on public.join_requests;
create policy join_requests_delete on public.join_requests
  for delete to authenticated
  using (uid = auth.uid() or public.is_room_admin(room_id));

-- calls ------------------------------------------------------------------------
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls
  for insert to authenticated
  with check (public.is_room_member(room_id) and created_by = auth.uid() and status = 'active');

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls
  for update to authenticated
  using (
    public.is_room_member(room_id)
    and (public.is_system_admin() or created_by = auth.uid() or public.is_room_admin(room_id))
  )
  with check (public.is_room_member(room_id));

-- call_participants ------------------------------------------------------------
drop policy if exists call_participants_select on public.call_participants;
create policy call_participants_select on public.call_participants
  for select to authenticated using (public.is_call_member(call_id));

drop policy if exists call_participants_insert on public.call_participants;
create policy call_participants_insert on public.call_participants
  for insert to authenticated
  with check (public.is_call_member(call_id) and (uid = auth.uid() or public.is_system_admin()));

drop policy if exists call_participants_update on public.call_participants;
create policy call_participants_update on public.call_participants
  for update to authenticated
  using (public.is_call_member(call_id) and (uid = auth.uid() or public.is_system_admin()))
  with check (public.is_call_member(call_id) and (uid = auth.uid() or public.is_system_admin()));

-- call_peers -------------------------------------------------------------------
drop policy if exists call_peers_select on public.call_peers;
create policy call_peers_select on public.call_peers
  for select to authenticated using (public.is_call_member(call_id));

drop policy if exists call_peers_insert on public.call_peers;
create policy call_peers_insert on public.call_peers
  for insert to authenticated with check (public.is_call_member(call_id));

drop policy if exists call_peers_update on public.call_peers;
create policy call_peers_update on public.call_peers
  for update to authenticated
  using (public.is_call_member(call_id)) with check (public.is_call_member(call_id));

-- call_ice_candidates ----------------------------------------------------------
drop policy if exists ice_select on public.call_ice_candidates;
create policy ice_select on public.call_ice_candidates
  for select to authenticated using (public.is_call_member(call_id));

drop policy if exists ice_insert on public.call_ice_candidates;
create policy ice_insert on public.call_ice_candidates
  for insert to authenticated with check (public.is_call_member(call_id));

-- -----------------------------------------------------------------------------
-- Realtime: full replica identity so filtered UPDATE/DELETE events carry the
-- filter columns, then add every live table to the realtime publication.
-- -----------------------------------------------------------------------------

alter table public.profiles            replica identity full;
alter table public.rooms               replica identity full;
alter table public.messages            replica identity full;
alter table public.join_requests       replica identity full;
alter table public.calls               replica identity full;
alter table public.call_participants   replica identity full;
alter table public.call_peers          replica identity full;
alter table public.call_ice_candidates replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'rooms', 'messages', 'join_requests',
    'calls', 'call_participants', 'call_peers', 'call_ice_candidates'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: public "voice" bucket for voice-message uploads.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('voice', 'voice', true)
on conflict (id) do update set public = true;

drop policy if exists "voice read" on storage.objects;
create policy "voice read" on storage.objects
  for select using (bucket_id = 'voice');

drop policy if exists "voice insert" on storage.objects;
create policy "voice insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'voice');
