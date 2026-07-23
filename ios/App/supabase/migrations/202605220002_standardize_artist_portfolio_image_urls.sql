-- Standard storage convention for the artist-portfolio bucket:
-- - artist profile photos: profile/{artistProfileId}/filename
-- - artist portfolio photos: portfolio/{artistProfileId}/filename
--
-- Existing rows may already contain full public URLs, and those should continue to render.
-- This helper only upgrades legacy relative image_url values to full public URLs. It does
-- not move files in Supabase Storage and does not write a storage_path column.

update public.artist_portfolio_photos
set image_url = 'https://wrkbkkbxkwawoabqfdeg.supabase.co/storage/v1/object/public/artist-portfolio/' || ltrim(image_url, '/')
where image_url is not null
  and btrim(image_url) <> ''
  and image_url !~* '^https?://';
