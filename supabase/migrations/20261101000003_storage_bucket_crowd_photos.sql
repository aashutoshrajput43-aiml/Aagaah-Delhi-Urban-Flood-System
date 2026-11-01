-- =============================================================================
-- STAGE 5: STORAGE BUCKET FOR CROWD-SOURCED FLOOD PHOTOS
-- Migration: 20261101000003_storage_bucket_crowd_photos.sql
-- =============================================================================

-- 1. Create crowd-photos storage bucket (Public read, 5MB limit, image types only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'crowd-photos',
    'crowd-photos',
    true,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2. Storage Policies
CREATE POLICY "Public View Crowd Photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'crowd-photos');

CREATE POLICY "Public Upload Crowd Photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'crowd-photos' AND
    (LOWER(SUBSTRING(name FROM '\.([^\.]+)$')) IN ('jpg', 'jpeg', 'png', 'webp'))
);

CREATE POLICY "Service Role Delete Crowd Photos"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'crowd-photos');

