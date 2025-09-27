-- Migration: add superadmin role and role management restrictions
-- Purpose:
-- - Allow role 'superadmin' in public.users.role
-- - Add helper functions is_superadmin() and is_admin_or_superadmin()
-- - Enforce only superadmin can change other users' roles via trigger
-- - Ensure superadmin has at least the same access as admin in policies where needed (users table)

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

-- 1) Extend allowed roles on users.role to include 'superadmin' (and 'user' for UI consistency)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role::text = ANY(ARRAY['superadmin','admin','contributor','reviewer','user']::text[])
  );

-- 2) Helper functions
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','superadmin')
  );
$$;

-- 3) Restrict role changes to superadmin using a trigger
CREATE OR REPLACE FUNCTION public.enforce_superadmin_for_role_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Only superadmin can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;$$;

-- Recreate trigger idempotently
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_before_update_enforce_role_change' AND tgrelid = 'public.users'::regclass
  ) THEN
    DROP TRIGGER trg_users_before_update_enforce_role_change ON public.users;
  END IF;
END $$;

CREATE TRIGGER trg_users_before_update_enforce_role_change
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_superadmin_for_role_change();

-- 4) Ensure RLS policies account for superadmin on users table
-- Add a blanket policy for superadmin manage-all on users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'users_superadmin_manage_all' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY users_superadmin_manage_all
      ON public.users
      FOR ALL
      USING (public.is_superadmin())
      WITH CHECK (public.is_superadmin());
  END IF;
END $$;

RESET ALL;
