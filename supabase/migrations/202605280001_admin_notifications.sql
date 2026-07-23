-- Admin notifications: in-app notification feed + automatic alert when a new
-- artist application is submitted. Designed to run independently of the front
-- end so admins are notified even when the app is not open.
--
-- Two layers of notification are created here:
--   1. In-app: a row in public.admin_notifications (always created, reliable).
--   2. Email: a non-blocking pg_net POST to the
--      `notify-admin-artist-application` edge function, which sends an email
--      via Resend. If pg_net is not enabled / not configured the email layer
--      silently no-ops; the in-app notification is unaffected.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.admin_notifications (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    title text not null,
    message text not null,
    data jsonb not null default '{}'::jsonb,
    read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists admin_notifications_created_at_idx
    on public.admin_notifications (created_at desc);

create index if not exists admin_notifications_read_idx
    on public.admin_notifications (read);

-- ---------------------------------------------------------------------------
-- RLS — admins only (mirrors public.is_admin() from prior migration)
-- ---------------------------------------------------------------------------
alter table public.admin_notifications enable row level security;

drop policy if exists "Admins can read admin_notifications" on public.admin_notifications;
create policy "Admins can read admin_notifications"
    on public.admin_notifications
    for select
    to authenticated
    using (public.is_admin());

drop policy if exists "Admins can update admin_notifications" on public.admin_notifications;
create policy "Admins can update admin_notifications"
    on public.admin_notifications
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Admins can delete admin_notifications" on public.admin_notifications;
create policy "Admins can delete admin_notifications"
    on public.admin_notifications
    for delete
    to authenticated
    using (public.is_admin());

-- No INSERT policy for clients — rows are only created by the trigger below
-- (SECURITY DEFINER) or by service-role contexts.

-- ---------------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------------
-- Inserts an in-app notification, then (best-effort) fires the email edge
-- function via pg_net. Runs as SECURITY DEFINER so the inserting user (an
-- artist applicant, who is NOT an admin) can still write the notification row.
create or replace function public.on_artist_application_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    applicant_label text;
    notif_title text := 'New artist application';
    notif_message text;
    edge_url text := 'https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/notify-admin-artist-application';
    service_key text;
begin
    applicant_label := coalesce(nullif(trim(NEW.business_name), ''), nullif(trim(NEW.name), ''), 'An artist');
    notif_message := applicant_label || ' applied to be listed';

    insert into public.admin_notifications (type, title, message, data)
    values (
        'artist_application',
        notif_title,
        notif_message,
        jsonb_build_object(
            'application_id', NEW.id,
            'name', NEW.name,
            'business_name', NEW.business_name,
            'email', NEW.email,
            'city', NEW.city,
            'country', NEW.country,
            'province_state', NEW.province_state,
            'services', NEW.services,
            'instagram', NEW.instagram,
            'submitted_at', NEW.created_at
        )
    );

    -- Best-effort email via edge function. Wrapped so a missing extension,
    -- missing service key, or transient network failure cannot block the
    -- artist's application submission.
    begin
        service_key := current_setting('app.settings.service_role_key', true);
        if service_key is not null and service_key <> '' then
            perform net.http_post(
                url := edge_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || service_key
                ),
                body := jsonb_build_object(
                    'application_id', NEW.id,
                    'name', NEW.name,
                    'business_name', NEW.business_name,
                    'email', NEW.email,
                    'city', NEW.city,
                    'country', NEW.country,
                    'province_state', NEW.province_state,
                    'services', NEW.services,
                    'instagram', NEW.instagram,
                    'submitted_at', NEW.created_at
                )
            );
        end if;
    exception when others then
        -- Swallow: in-app notification has already been written.
        raise notice 'notify-admin-artist-application http_post skipped: %', sqlerrm;
    end;

    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists artist_applications_notify_admin on public.artist_applications;
create trigger artist_applications_notify_admin
    after insert on public.artist_applications
    for each row
    execute function public.on_artist_application_inserted();

-- ---------------------------------------------------------------------------
-- One-time setup notes (run manually in the Supabase SQL editor as service role):
--
--   1. Enable pg_net (Database > Extensions):
--        create extension if not exists pg_net with schema extensions;
--
--   2. Store the service role key so the trigger can authenticate against the
--      edge function. Replace <SERVICE_ROLE_KEY> with the project's service
--      role key from Project Settings > API:
--        alter database postgres set app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
--
--   3. Set RESEND_API_KEY and (optionally) ADMIN_EMAIL as edge function
--      secrets via the Supabase dashboard for the
--      `notify-admin-artist-application` function.
--
-- If steps 1/2 are skipped the in-app notification still works; only the email
-- layer is disabled.
-- ---------------------------------------------------------------------------
