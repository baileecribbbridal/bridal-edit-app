do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'bride_current_photos'
          and policyname = 'Authenticated users can delete own current photos'
    ) then
        create policy "Authenticated users can delete own current photos"
        on public.bride_current_photos
        for delete
        to authenticated
        using (auth.uid() = bride_id);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Authenticated users can delete own current photo objects'
    ) then
        create policy "Authenticated users can delete own current photo objects"
        on storage.objects
        for delete
        to authenticated
        using (
            bucket_id = 'bride-current-photos'
            and auth.uid()::text = (storage.foldername(name))[1]
        );
    end if;
end $$;
