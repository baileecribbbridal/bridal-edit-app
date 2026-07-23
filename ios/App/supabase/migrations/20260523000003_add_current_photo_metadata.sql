alter table public.bride_current_photos
add column if not exists category text,
add column if not exists notes text;
