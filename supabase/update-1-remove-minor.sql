-- =====================================================================
-- Update 1: remove under-18 tracking
--
-- Run this ONCE in Supabase SQL Editor if you already ran schema.sql.
-- Your roster, accounts and posts are kept.
-- =====================================================================

-- Private messages now only depend on being active and not blocked.
create or replace function public.can_dm(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_active()
    and other <> auth.uid()
    and exists (select 1 from public.profiles where id = other and status = 'active')
    and not public.is_blocked(auth.uid(), other),
  false);
$$;

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

drop function if exists public.dm_allowed(uuid, uuid);

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

create or replace function public.sync_profile_from_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.claimed_by is not null then
    update public.profiles
       set full_name = new.full_name, role = new.role, batch_year = new.batch_year
     where id = new.claimed_by;
  end if;
  return new;
end;
$$;

drop function if exists public.admin_list_members();
create function public.admin_list_members()
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

alter table public.roster   drop column if exists is_minor;
alter table public.profiles drop column if exists is_minor;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;
