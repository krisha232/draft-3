-- =====================================================================
-- Update 2: profile photos, file attachments on posts, alumni university
--
-- Run this ONCE in Supabase SQL Editor (after update-1).
-- Photos and files are private: only approved members can see them.
-- =====================================================================

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
