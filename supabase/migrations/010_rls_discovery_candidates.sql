-- Migration 010: enable RLS on discovery_candidates
-- The table stores internal pipeline data. Anon and authenticated users
-- must not be able to read or write it — only the service_role (admin + edge functions).

alter table discovery_candidates enable row level security;

-- No explicit policy needed: with RLS enabled and no matching policy,
-- all access by anon/authenticated is denied by default.
-- Service_role bypasses RLS entirely, so admin and pipeline access is unaffected.
