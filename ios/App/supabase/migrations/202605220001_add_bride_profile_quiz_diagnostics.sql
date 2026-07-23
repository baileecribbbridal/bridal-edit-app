alter table public.bride_profiles
    add column if not exists extension_status text,
    add column if not exists hair_behavior text,
    add column if not exists makeup_comfort_level text,
    add column if not exists photo_concern text,
    add column if not exists wedding_climate text,
    add column if not exists glam_duration text,
    add column if not exists bridal_reaction_goal text;
