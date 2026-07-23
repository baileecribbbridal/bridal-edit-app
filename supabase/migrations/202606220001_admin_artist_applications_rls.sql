-- Allow existing Admin Dashboard approval flow to update artist applications.
-- Reuses public.is_admin(), defined in 202605240003_admin_artist_profiles_rls.sql.

alter table public.artist_applications enable row level security;

drop policy if exists "Admins can read artist_applications" on public.artist_applications;
create policy "Admins can read artist_applications"
  on public.artist_applications
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update artist_applications" on public.artist_applications;
create policy "Admins can update artist_applications"
  on public.artist_applications
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
