do $$
begin
    if to_regclass('public.bride_current_photos') is not null then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_current_photos'
              and column_name = 'caption'
        ) and not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_current_photos'
              and column_name = 'notes'
        ) then
            alter table public.bride_current_photos rename column caption to notes;
        elsif not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_current_photos'
              and column_name = 'notes'
        ) then
            alter table public.bride_current_photos add column notes text;
        end if;
    end if;

    if to_regclass('public.bride_inspo_photos') is not null then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_inspo_photos'
              and column_name = 'caption'
        ) and not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_inspo_photos'
              and column_name = 'notes'
        ) then
            alter table public.bride_inspo_photos rename column caption to notes;
        elsif not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'bride_inspo_photos'
              and column_name = 'notes'
        ) then
            alter table public.bride_inspo_photos add column notes text;
        end if;
    end if;
end $$;

do $$
begin
    if to_regclass('public.bride_current_photos') is not null
       and exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'bride_current_photos'
             and column_name = 'caption'
       )
       and exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'bride_current_photos'
             and column_name = 'notes'
       ) then
        update public.bride_current_photos
        set notes = coalesce(notes, caption);
        alter table public.bride_current_photos drop column caption;
    end if;

    if to_regclass('public.bride_inspo_photos') is not null
       and exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'bride_inspo_photos'
             and column_name = 'caption'
       )
       and exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'bride_inspo_photos'
             and column_name = 'notes'
       ) then
        update public.bride_inspo_photos
        set notes = coalesce(notes, caption);
        alter table public.bride_inspo_photos drop column caption;
    end if;
end $$;
