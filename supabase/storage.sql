-- Create private storage buckets in Supabase (Storage → New bucket),
-- or run via the Supabase dashboard / management API.
--
-- Buckets:
--   surgical-videos  (private)
--   narration-audio  (private)
--
-- Recommended policies (authenticated read/write of own paths):

-- Example policies (adjust bucket names as needed):

-- allow authenticated uploads to a user-scoped prefix
-- create policy "auth upload videos"
-- on storage.objects for insert to authenticated
-- with check (bucket_id = 'surgical-videos' and auth.role() = 'authenticated');

-- create policy "auth read videos"
-- on storage.objects for select to authenticated
-- using (bucket_id = 'surgical-videos' and auth.role() = 'authenticated');

-- create policy "auth upload audio"
-- on storage.objects for insert to authenticated
-- with check (bucket_id = 'narration-audio' and auth.role() = 'authenticated');

-- create policy "auth read audio"
-- on storage.objects for select to authenticated
-- using (bucket_id = 'narration-audio' and auth.role() = 'authenticated');

-- Prefer serving media through signed URLs or an authenticated app proxy
-- rather than public buckets.
