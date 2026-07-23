alter table if exists public.bride_current_photos
add column if not exists notes text;

alter table if exists public.bride_inspo_photos
add column if not exists notes text;
