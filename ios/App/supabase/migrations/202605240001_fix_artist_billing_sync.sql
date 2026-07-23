alter table public.artist_profiles
    add column if not exists stripe_customer_id text,
    add column if not exists stripe_subscription_id text,
    add column if not exists artist_subscription_status text;

create index if not exists artist_profiles_lower_email_idx
    on public.artist_profiles (lower(email));

update public.artist_profiles
set tier = 'premium'
where lower(coalesce(tier, '')) in ('featured', 'upgraded');

update public.artist_profiles
set tier = 'free'
where lower(coalesce(artist_subscription_status, '')) not in ('active', 'trialing')
  and lower(coalesce(tier, '')) = 'premium';
