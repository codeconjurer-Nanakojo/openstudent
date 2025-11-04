-- Migration: Bootstrap superadmin profile from auth.users
-- Purpose: Ensure the designated superadmin profile exists and is promoted on each reset
-- Constraints: Keep RLS on public.users; do not alter role-enforcement triggers/policies
-- Email: nanakojo1@openstudent.com
-- Idempotent: Uses INSERT ... ON CONFLICT ... DO UPDATE
-- Note: If the auth user does not exist yet, register via the frontend first.

SET client_min_messages = warning;
SET standard_conforming_strings = on;

-- Upsert superadmin profile based on auth.users. This does not disable RLS and does not
-- modify any triggers. It only creates/updates the matching row in public.users.
INSERT INTO public.users (id, email, role, full_name, is_verified)
SELECT u.id,
       u.email,
       'superadmin' AS role,
       COALESCE(u.raw_user_meta_data ->> 'full_name', 'Bootstrap Superadmin') AS full_name,
       TRUE AS is_verified
FROM auth.users AS u
WHERE lower(u.email) = lower('nanakojo1@openstudent.com')
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
      is_verified = TRUE;
