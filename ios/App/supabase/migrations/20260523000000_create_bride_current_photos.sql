create table if not exists public.bride_current_photos (
    id uuid primary key default gen_random_uuid(),
    bride_id uuid not null,
    image_url text not null,
    photo_type text,
    sort_order integer default 0,
    created_at timestamptz default now()
);

alter table public.bride_current_photos enable row level security;

create policy "Authenticated users can read own current photos"
on public.bride_current_photos
for select
to authenticated
using (auth.uid() = bride_id);

create policy "Authenticated users can insert own current photos"
on public.bride_current_photos
for insert
to authenticated
with check (auth.uid() = bride_id);

create policy "Authenticated users can delete own current photos"
on public.bride_current_photos
for delete
to authenticated
using (auth.uid() = bride_id);

insert into storage.buckets (id, name, public)
values ('bride-current-photos', 'bride-current-photos', true)
on conflict (id) do nothing;

create policy "Authenticated users can read own current photo objects"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'bride-current-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Authenticated users can insert own current photo objects"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'bride-current-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Authenticated users can delete own current photo objects"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'bride-current-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
);
