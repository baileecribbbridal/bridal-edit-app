alter table public.artist_profiles
    add column if not exists bio text,
    add column if not exists aesthetic text,
    add column if not exists specialties text[],
    add column if not exists best_for text[],
    add column if not exists not_ideal_for text[],
    add column if not exists starting_price text,
    add column if not exists travels boolean,
    add column if not exists website text,
    add column if not exists instagram text,
    add column if not exists profile_photo_url text,
    add column if not exists is_published boolean default true,
    add column if not exists is_active boolean default true,
    add column if not exists tier text,
    add column if not exists services text,
    add column if not exists city text,
    add column if not exists state text,
    add column if not exists country text,
    add column if not exists email text;

update public.artist_profiles
set
    bio = 'Specializing in Hollywood waves, structured bridal styling, and airbrushed makeup designed to hold in coastal heat, humidity, and long timelines. Signature: The Bailee Wave + Sculpt™.',
    aesthetic = 'Coastal editorial glam — structured, polished, engineered to hold.',
    specialties = array[
        'Hollywood Waves',
        'The Bailee Wave + Sculpt™',
        'Airbrush',
        'Structured Bridal Styling'
    ],
    best_for = array[
        'Fine hair brides',
        'Coastal/humid weddings',
        'Longevity-focused brides',
        'Editorial photography'
    ],
    not_ideal_for = array[
        'Undone boho texture',
        'Ultra-natural no-makeup',
        'Loose unlstructured waves'
    ],
    starting_price = 'Request quote',
    travels = true,
    website = 'baileecribbbridal.com',
    instagram = nullif(coalesce(instagram, ''), ''),
    profile_photo_url = nullif(coalesce(profile_photo_url, ''), ''),
    is_published = true,
    is_active = true,
    tier = 'signature',
    services = 'Hair + Makeup',
    city = 'Myrtle Beach',
    state = 'SC',
    country = 'United States',
    email = 'bailee@baileecribbbridal.com'
where business_name = 'Bailee Cribb Bridal';
