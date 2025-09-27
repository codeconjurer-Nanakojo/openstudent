-- Migration: users self-profile RLS policies
-- Purpose: Allow newly signed-up users to insert/select/update their own row in public.users
-- Notes: Keeps existing admin/superadmin capabilities. Role-change trigger remains in effect.

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

-- Ensure RLS is enabled on users
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can insert their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.users
      FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Policy: Users can view their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can view their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can view their own profile"
      ON public.users
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Policy: Users can update their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Users can update their own profile' AND polrelid = 'public.users'::regclass
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.users
      FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

RESET ALL;
