create table if not exists public.bride_inspo_photos (
    id uuid primary key default gen_random_uuid(),
    bride_id uuid not null,
    image_url text not null,
    caption text,
    category text,
    created_at timestamptz default now()
);

create index if not exists bride_inspo_photos_bride_id_idx
    on public.bride_inspo_photos (bride_id, created_at desc);

alter table public.bride_inspo_photos enable row level security;

grant select, insert, delete on public.bride_inspo_photos to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'bride_inspo_photos'
          and policyname = 'Brides can read their own inspo photos'
    ) then
        create policy "Brides can read their own inspo photos"
        on public.bride_inspo_photos
        for select
        to authenticated
        using (bride_id = auth.uid());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'bride_inspo_photos'
          and policyname = 'Brides can insert their own inspo photos'
    ) then
        create policy "Brides can insert their own inspo photos"
        on public.bride_inspo_photos
        for insert
        to authenticated
        with check (bride_id = auth.uid());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'bride_inspo_photos'
          and policyname = 'Brides can delete their own inspo photos'
    ) then
        create policy "Brides can delete their own inspo photos"
        on public.bride_inspo_photos
        for delete
        to authenticated
        using (bride_id = auth.uid());
    end if;
end $$;

-- Storage bucket setup: create a public bucket named "bride-inspo" via the Supabase Dashboard
-- (Storage → New bucket → bride-inspo → Public: ON). Then run the policies below.

do $$
begin
    if exists (select 1 from pg_class where relname = 'objects' and relnamespace = (select oid from pg_namespace where nspname = 'storage')) then
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'Brides can read their own inspo storage objects'
        ) then
            execute $sql$
                create policy "Brides can read their own inspo storage objects"
                on storage.objects
                for select
                to authenticated
                using (bucket_id = 'bride-inspo' and (storage.foldername(name))[1] = auth.uid()::text)
            $sql$;
        end if;

        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'Brides can upload their own inspo storage objects'
        ) then
            execute $sql$
                create policy "Brides can upload their own inspo storage objects"
                on storage.objects
                for insert
                to authenticated
                with check (bucket_id = 'bride-inspo' and (storage.foldername(name))[1] = auth.uid()::text)
            $sql$;
        end if;

        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'Brides can delete their own inspo storage objects'
        ) then
            execute $sql$
                create policy "Brides can delete their own inspo storage objects"
                on storage.objects
                for delete
                to authenticated
                using (bucket_id = 'bride-inspo' and (storage.foldername(name))[1] = auth.uid()::text)
            $sql$;
        end if;
    end if;
end $$;
