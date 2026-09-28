-- =====================================================================
-- Update 3: alumni study details
--   field    = area of study, picked from a list (used for sorting)
--   major    = their college course, e.g. "B.Tech Computer Science"
--   subjects = subjects they took at school
-- (university/college was added in update 2)
--
-- Run this ONCE in Supabase SQL Editor (after updates 1 and 2).
-- =====================================================================

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
