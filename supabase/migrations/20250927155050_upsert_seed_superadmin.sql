-- Migration: Upsert default superadmin into public.users from auth.users
-- Goal: Ensure there is always a superadmin account after resets
-- Email: nanakojo1@openstudent.com

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Upsert superadmin profile based on auth.users
-- If the auth user exists, ensure a matching profile exists with role='superadmin'
INSERT INTO public.users (id, email, role, full_name, is_verified, created_at, updated_at)
SELECT u.id,
       u.email,
       'superadmin' AS role,
       COALESCE( (u.raw_user_meta_data ->> 'full_name'), 'Bootstrap Superadmin') AS full_name,
       TRUE AS is_verified,
       NOW() AS created_at,
       NOW() AS updated_at
FROM auth.users u
WHERE lower(u.email) = lower('nanakojo1@openstudent.com')
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      email = EXCLUDED.email,
      updated_at = NOW();

RESET ALL;
