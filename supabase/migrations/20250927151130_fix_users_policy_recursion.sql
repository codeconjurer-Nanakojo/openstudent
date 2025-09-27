-- Migration: fix recursion on public.users policies causing stack depth errors
-- Problem: A policy on public.users referenced public.is_superadmin(), which queries public.users,
--          leading to self-recursive evaluation when selecting from users via PostgREST.
-- Fix: Drop the recursive policy and rely on simple self policies plus existing admin policies that use JWT claims.

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

-- 1) Ensure RLS remains enabled on users
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- 2) Drop recursive superadmin policy on users if it exists (to avoid self-reference)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'users_superadmin_manage_all' AND polrelid = 'public.users'::regclass
  ) THEN
    DROP POLICY "users_superadmin_manage_all" ON public.users;
  END IF;
END $$;

-- 3) Re-assert simple self policies (idempotent; created if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can insert their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.users FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can view their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can view their own profile"
      ON public.users FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can update their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.users FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

-- Note: Admin-wide users policies based on JWT claims from baseline remain intact.
-- Trigger enforce_superadmin_for_role_change() remains active and only runs on UPDATE, so it does not affect SELECT.

RESET ALL;
