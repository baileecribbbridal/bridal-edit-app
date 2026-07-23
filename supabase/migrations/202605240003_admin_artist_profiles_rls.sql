-- Allow admin users to insert and update rows in public.artist_profiles.
-- Mirrors the client-side admin check in src/App.jsx (line ~1874):
--   user.email = 'baileecribbhair@gmail.com' OR profiles.role = 'admin' OR profiles.is_admin = true
-- artist_profiles remains NOT publicly writable: only admins can insert/update via these policies.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (
        p.role = 'admin'
        or p.is_admin = true
        or p.email = 'baileecribbhair@gmail.com'
      )
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.artist_profiles enable row level security;

drop policy if exists "Admins can insert artist_profiles" on public.artist_profiles;
create policy "Admins can insert artist_profiles"
  on public.artist_profiles
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update artist_profiles" on public.artist_profiles;
create policy "Admins can update artist_profiles"
  on public.artist_profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
