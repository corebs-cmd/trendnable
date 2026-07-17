-- Create private exports bucket for temporary CSV downloads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', false, 5242880, ARRAY['text/csv'])
ON CONFLICT (id) DO NOTHING;
