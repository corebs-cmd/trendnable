-- Migration 006: RLS policies for users table
-- Allows authenticated users to manage their own profile row.

create policy "users can insert own profile"
  on users for insert
  to authenticated
  with check (id = auth.uid());

create policy "users can read own profile"
  on users for select
  to authenticated
  using (id = auth.uid());

create policy "users can update own profile"
  on users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
