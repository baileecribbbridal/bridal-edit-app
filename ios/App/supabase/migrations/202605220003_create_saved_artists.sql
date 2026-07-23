create table if not exists public.saved_artists (
    id uuid primary key default gen_random_uuid(),
    bride_id uuid not null,
    artist_id uuid not null,
    created_at timestamptz default now()
);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'saved_artists_bride_id_artist_id_key'
          and conrelid = 'public.saved_artists'::regclass
    ) then
        alter table public.saved_artists
        add constraint saved_artists_bride_id_artist_id_key unique (bride_id, artist_id);
    end if;
end $$;

alter table public.saved_artists enable row level security;

grant select, insert, delete on public.saved_artists to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'saved_artists'
          and policyname = 'Users can read their own saved artists'
    ) then
        create policy "Users can read their own saved artists"
        on public.saved_artists
        for select
        to authenticated
        using (bride_id = auth.uid());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'saved_artists'
          and policyname = 'Users can insert their own saved artists'
    ) then
        create policy "Users can insert their own saved artists"
        on public.saved_artists
        for insert
        to authenticated
        with check (bride_id = auth.uid());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'saved_artists'
          and policyname = 'Users can delete their own saved artists'
    ) then
        create policy "Users can delete their own saved artists"
        on public.saved_artists
        for delete
        to authenticated
        using (bride_id = auth.uid());
    end if;
end $$;
