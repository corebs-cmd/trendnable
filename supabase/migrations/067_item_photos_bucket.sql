-- User-submitted scan photos for catalog items.
-- Public read so image URLs work in-app without auth.
-- Authenticated write so only signed-in users can upload.
-- 5MB limit, JPEG/PNG/WebP only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-photos',
  'item-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "item_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'item-photos');

CREATE POLICY "item_photos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'item-photos'
    AND auth.role() = 'authenticated'
  );
