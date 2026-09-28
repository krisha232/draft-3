-- =====================================================================
-- School Connect: database schema for Supabase
--
-- Run this whole file ONCE in your Supabase project:
--   Dashboard -> SQL Editor -> New query -> paste everything -> Run
--
-- Every security rule lives here, inside the database. Even if someone
-- tampers with the website code, the database refuses anything these
-- rules don't allow.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- The official list of school ID numbers. Only admins can see or edit it.
-- Each ID can be claimed by exactly one login account.
create table public.roster (
  id_number   text primary key
              check (id_number = upper(btrim(id_number)) and length(id_number) between 3 and 40),
  full_name   text not null check (length(btrim(full_name)) > 0),
  role        text not null check (role in ('student', 'alumni', 'staff')),
  batch_year  int check (batch_year between 1900 and 2200),   -- graduation year ("class of")
  claimed_by  uuid unique references auth.users (id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- One profile per verified member. Created only by claim_id() below.
-- The ID number is NOT stored here, so other members never see it.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        text not null check (role in ('student', 'alumni', 'staff')),
  batch_year  int,
  is_admin    boolean not null default false,
  status      text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  headline    text check (length(headline) <= 120),
  bio         text check (length(bio) <= 2000),
  location    text check (length(location) <= 80),
  created_at  timestamptz not null default now()
);

-- Failed ID claims, used to stop people guessing ID numbers.
create table public.claim_attempts (
  id           bigserial primary key,
  user_id      uuid not null,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);
create index on public.claim_attempts (user_id, attempted_at);

create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null default 'general'
             check (kind in ('general', 'question', 'opportunity', 'announcement')),
  body       text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.posts (created_at desc);
create index on public.posts (author_id);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.comments (post_id, created_at);

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 150),
  description text check (length(description) <= 3000),
  location    text check (length(location) <= 150),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index on public.events (starts_at);

create table public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status     text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

create table public.user_blocks (
  blocker    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type      text not null check (target_type in ('post', 'comment', 'event', 'message', 'user')),
  target_id        uuid not null,
  target_author_id uuid references public.profiles (id) on delete set null,
  snapshot         text,          -- copy of the reported content, filled in automatically
  reason           text not null check (length(btrim(reason)) between 1 and 1000),
  status           text not null default 'open' check (status in ('open', 'resolved')),
  created_at       timestamptz not null default now()
);
create index on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS (used by the security rules)
-- ---------------------------------------------------------------------

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and is_admin);
$$;

create or replace function public.is_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = conv and user_id = auth.uid());
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- Can the signed-in member start a private chat with `other`?
create or replace function public.can_dm(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_active()
    and other <> auth.uid()
    and exists (select 1 from public.profiles where id = other and status = 'active')
    and not public.is_blocked(auth.uid(), other),
  false);
$$;

-- Can the signed-in member send into this conversation right now?
create or replace function public.can_send(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_active()
    and public.is_member(conv)
    and not exists (
      select 1
      from public.conversation_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.conversation_id = conv
        and cm.user_id <> auth.uid()
        and (p.status <> 'active' or public.is_blocked(auth.uid(), cm.user_id))
    ),
  false);
$$;

-- ---------------------------------------------------------------------
-- 3. ACTIONS (called from the website)
-- ---------------------------------------------------------------------

-- Link the signed-in account to a school ID number.
-- Returns 'ok', 'no_match' or 'already_claimed'.
create or replace function public.claim_id(p_id_number text, p_full_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r     public.roster%rowtype;
  fails int;
  norm_id text := upper(btrim(coalesce(p_id_number, '')));
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'This account is already linked to a school ID.';
  end if;

  select count(*) into fails
  from public.claim_attempts
  where user_id = auth.uid() and not success and attempted_at > now() - interval '1 hour';
  if fails >= 5 then
    raise exception 'Too many attempts. Try again in an hour, or contact the school office.';
  end if;

  select * into r from public.roster where id_number = norm_id for update;

  if not found
     or lower(regexp_replace(btrim(r.full_name), '\s+', ' ', 'g'))
        <> lower(regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')) then
    insert into public.claim_attempts (user_id, success) values (auth.uid(), false);
    return 'no_match';
  end if;

  if r.claimed_by is not null then
    insert into public.claim_attempts (user_id, success) values (auth.uid(), false);
    return 'already_claimed';
  end if;

  update public.roster set claimed_by = auth.uid(), claimed_at = now() where id_number = r.id_number;
  insert into public.profiles (id, full_name, role, batch_year, status)
  values (auth.uid(), r.full_name, r.role, r.batch_year, 'pending');
  insert into public.claim_attempts (user_id, success) values (auth.uid(), true);
  return 'ok';
end;
$$;

-- Open (or reuse) a private chat with another member.
create or replace function public.get_or_create_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
begin
  if not public.can_dm(other) then
    raise exception 'You can''t send private messages to this member.';
  end if;

  select cm1.conversation_id into conv
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id and cm2.user_id = other
  where cm1.user_id = auth.uid()
  limit 1;

  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv, auth.uid()), (conv, other);
  end if;
  return conv;
end;
$$;

-- ----- Admin-only actions -----

create or replace function public.admin_list_members()
returns table (
  user_id uuid, email text, id_number text, full_name text, role text,
  batch_year int, status text, is_admin boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.';
  end if;
  return query
    select p.id, u.email::text, r.id_number, p.full_name, p.role,
           p.batch_year, p.status, p.is_admin, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.roster r on r.claimed_by = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_status(target uuid, new_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if new_status not in ('pending', 'active', 'suspended') then raise exception 'Unknown status.'; end if;
  if target = auth.uid() and new_status <> 'active' then
    raise exception 'You can''t suspend your own account.';
  end if;
  update public.profiles set status = new_status where id = target;
end;
$$;

create or replace function public.admin_set_admin(target uuid, make_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if target = auth.uid() and not make_admin then
    raise exception 'You can''t remove your own admin access. Ask another admin.';
  end if;
  update public.profiles set is_admin = make_admin where id = target;
end;
$$;

-- Unlink an account from its ID (e.g. the wrong person claimed it).
-- Deletes that member's profile and everything they posted.
-- The ID becomes available to claim again.
create or replace function public.admin_unlink(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if target = auth.uid() then raise exception 'You can''t unlink your own account.'; end if;
  update public.roster set claimed_by = null, claimed_at = null where claimed_by = target;
  delete from public.profiles where id = target;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. AUTOMATIC BEHAVIOUR (triggers)
-- ---------------------------------------------------------------------

-- Keep a member's name/role/year in sync when admins edit the roster.
create or replace function public.sync_profile_from_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.claimed_by is not null then
    update public.profiles
       set full_name = new.full_name, role = new.role,
           batch_year = new.batch_year
     where id = new.claimed_by;
  end if;
  return new;
end;
$$;
create trigger roster_sync after update on public.roster
for each row execute function public.sync_profile_from_roster();

-- Bump the conversation when a message arrives.
create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_touch after insert on public.messages
for each row execute function public.touch_conversation();

-- Copy reported content into the report so admins can review it
-- (admins cannot read private messages otherwise).
create or replace function public.fill_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.reporter_id := auth.uid();
  new.status := 'open';
  if new.target_type = 'post' then
    select body, author_id into new.snapshot, new.target_author_id
      from public.posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select body, author_id into new.snapshot, new.target_author_id
      from public.comments where id = new.target_id;
  elsif new.target_type = 'event' then
    select title || E'\n' || coalesce(description, ''), created_by into new.snapshot, new.target_author_id
      from public.events where id = new.target_id;
  elsif new.target_type = 'message' then
    select m.body, m.sender_id into new.snapshot, new.target_author_id
      from public.messages m
     where m.id = new.target_id and public.is_member(m.conversation_id);
  elsif new.target_type = 'user' then
    select full_name, id into new.snapshot, new.target_author_id
      from public.profiles where id = new.target_id;
  end if;
  if new.target_author_id is null then
    raise exception 'That content no longer exists.';
  end if;
  return new;
end;
$$;
create trigger reports_fill before insert on public.reports
for each row execute function public.fill_report();

-- ---------------------------------------------------------------------
-- 5. SECURITY RULES (row level security)
-- ---------------------------------------------------------------------

alter table public.roster               enable row level security;
alter table public.profiles             enable row level security;
alter table public.claim_attempts       enable row level security;  -- no policies: nobody reads it directly
alter table public.posts                enable row level security;
alter table public.comments             enable row level security;
alter table public.post_likes           enable row level security;
alter table public.events               enable row level security;
alter table public.event_rsvps          enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.user_blocks          enable row level security;
alter table public.reports              enable row level security;

-- roster: admins manage it; a member can see only their own row (to view their ID)
create policy roster_select on public.roster for select to authenticated
  using (public.is_admin() or claimed_by = auth.uid());
create policy roster_insert on public.roster for insert to authenticated
  with check (public.is_admin());
create policy roster_update on public.roster for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy roster_delete on public.roster for delete to authenticated
  using (public.is_admin() and claimed_by is null);

-- profiles: you see yourself; active members see other active members; admins see all
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_active() and status = 'active'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- posts
create policy posts_select on public.posts for select to authenticated
  using (public.is_active());
create policy posts_insert on public.posts for insert to authenticated
  with check (public.is_active() and author_id = auth.uid()
              and (kind <> 'announcement' or public.is_admin()));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- comments
create policy comments_select on public.comments for select to authenticated
  using (public.is_active());
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_active() and author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- likes
create policy likes_select on public.post_likes for select to authenticated
  using (public.is_active());
create policy likes_insert on public.post_likes for insert to authenticated
  with check (public.is_active() and user_id = auth.uid());
create policy likes_delete on public.post_likes for delete to authenticated
  using (user_id = auth.uid());

-- events
create policy events_select on public.events for select to authenticated
  using (public.is_active());
create policy events_insert on public.events for insert to authenticated
  with check (public.is_active() and created_by = auth.uid());
create policy events_update on public.events for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy events_delete on public.events for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- rsvps
create policy rsvps_select on public.event_rsvps for select to authenticated
  using (public.is_active());
create policy rsvps_insert on public.event_rsvps for insert to authenticated
  with check (public.is_active() and user_id = auth.uid());
create policy rsvps_update on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rsvps_delete on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

-- conversations & messages: only the people in the conversation can see it
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_member(id));
create policy conv_members_select on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id));
create policy conv_members_update on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_send(conversation_id));
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid() or public.is_admin());

-- blocks: private to the person who blocked
create policy blocks_select on public.user_blocks for select to authenticated
  using (blocker = auth.uid());
create policy blocks_insert on public.user_blocks for insert to authenticated
  with check (blocker = auth.uid() and public.is_active());
create policy blocks_delete on public.user_blocks for delete to authenticated
  using (blocker = auth.uid());

-- reports: you see your own reports; admins see and resolve all
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated
  with check (public.is_active() and reporter_id = auth.uid());
create policy reports_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. PERMISSIONS (which columns the website may touch at all)
-- ---------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select (id, full_name, role, batch_year, is_admin, status, headline, bio, location, created_at)
  on public.profiles to authenticated;
grant update (headline, bio, location) on public.profiles to authenticated;

grant select, insert, update, delete on public.roster to authenticated;

grant select, delete on public.posts to authenticated;
grant insert (body, kind, author_id) on public.posts to authenticated;

grant select, delete on public.comments to authenticated;
grant insert (post_id, body, author_id) on public.comments to authenticated;

grant select, delete on public.post_likes to authenticated;
grant insert (post_id, user_id) on public.post_likes to authenticated;

grant select, delete on public.events to authenticated;
grant insert (title, description, location, starts_at, ends_at, created_by) on public.events to authenticated;
grant update (title, description, location, starts_at, ends_at) on public.events to authenticated;

grant select, delete on public.event_rsvps to authenticated;
grant insert (event_id, user_id, status) on public.event_rsvps to authenticated;
grant update (status) on public.event_rsvps to authenticated;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (conversation_id, body, sender_id) on public.messages to authenticated;

grant select, delete on public.user_blocks to authenticated;
grant insert (blocked, blocker) on public.user_blocks to authenticated;

grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 7. LIVE UPDATES for messages
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------
-- 8. PROFILE PHOTOS, FILE ATTACHMENTS, UNIVERSITY
-- ---------------------------------------------------------------------

-- ---------- Profile photo + university ----------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists university  text;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path like id::text || '/%');   -- only your own photo

alter table public.profiles drop constraint if exists profiles_university_check;
alter table public.profiles add constraint profiles_university_check
  check (length(university) <= 120);

grant select (avatar_path, university) on public.profiles to authenticated;
grant update (avatar_path, university) on public.profiles to authenticated;

-- ---------- Attachments on posts ----------
-- Stored as a list: [{ "path": "...", "name": "...", "type": "...", "size": 123 }]
alter table public.posts add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Files in a post must be in the author's own folder
create or replace function public.attachments_valid(a jsonb, owner uuid) returns boolean
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 4 then false
    else coalesce((
      select bool_and(
        jsonb_typeof(e) = 'object'
        and (e ->> 'path') like owner::text || '/%'
        and length(e ->> 'path') <= 300
        and length(coalesce(e ->> 'name', '')) <= 200)
      from jsonb_array_elements(a) e), true)
  end;
$$;

alter table public.posts drop constraint if exists posts_attachments_check;
alter table public.posts add constraint posts_attachments_check
  check (public.attachments_valid(attachments, author_id));

-- A post may now be just files with no text
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check
  check (length(body) <= 5000
         and (length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0));

grant insert (attachments) on public.posts to authenticated;

-- ---------- File storage (both private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152,            -- 2 MB
   array['image/jpeg', 'image/png', 'image/webp']),
  ('attachments', 'attachments', false, 10485760,   -- 10 MB per file
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'application/pdf', 'text/plain', 'text/csv',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

drop policy if exists sc_avatars_read       on storage.objects;
drop policy if exists sc_avatars_upload     on storage.objects;
drop policy if exists sc_avatars_delete     on storage.objects;
drop policy if exists sc_attachments_read   on storage.objects;
drop policy if exists sc_attachments_upload on storage.objects;
drop policy if exists sc_attachments_delete on storage.objects;

-- Profile photos: approved members see them; you upload/delete only in your own folder
create policy sc_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and (public.is_active() or (storage.foldername(name))[1] = auth.uid()::text));
create policy sc_avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_active()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy sc_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Post attachments: approved members see them; upload only to your own folder;
-- delete your own, or admins delete any
create policy sc_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_active());
create policy sc_attachments_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_active()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy sc_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 9. ALUMNI STUDY DETAILS
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists field    text;
alter table public.profiles add column if not exists major    text;
alter table public.profiles add column if not exists subjects text;

alter table public.profiles drop constraint if exists profiles_field_check;
alter table public.profiles add constraint profiles_field_check check (length(field) <= 60);
alter table public.profiles drop constraint if exists profiles_major_check;
alter table public.profiles add constraint profiles_major_check check (length(major) <= 120);
alter table public.profiles drop constraint if exists profiles_subjects_check;
alter table public.profiles add constraint profiles_subjects_check check (length(subjects) <= 200);

grant select (field, major, subjects) on public.profiles to authenticated;
grant update (field, major, subjects) on public.profiles to authenticated;

-- =====================================================================
-- Done. Next: follow "Make yourself the first admin" in README.md
-- =====================================================================
