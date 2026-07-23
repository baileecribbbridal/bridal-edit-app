alter table public.bride_current_photos
add column if not exists photo_type text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'bride_current_photos_photo_type_check'
    ) then
        alter table public.bride_current_photos
        add constraint bride_current_photos_photo_type_check
        check (photo_type is null or photo_type in ('front', 'side', 'hair'));
    end if;
end $$;

update storage.buckets
set public = false
where id = 'bride-current-photos';
