-- Migration: add moderation_logs table and fix increment_project_views RPC arg name
-- Purpose:
-- 1) Create public.moderation_logs used by admin UI (`logModerationAction`, `getModerationHistory`).
-- 2) Align function public.increment_project_views to accept named arg `doc_id` to match JS RPC usage.

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

-- 1) moderation_logs table
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_moderation_logs_project ON public.moderation_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_actor ON public.moderation_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON public.moderation_logs (created_at);

-- Enable RLS and add strict admin-only policies (UI only exposes to admins)
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- Admin full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'moderation_logs_admin_all' AND polrelid = 'public.moderation_logs'::regclass
  ) THEN
    CREATE POLICY moderation_logs_admin_all
      ON public.moderation_logs
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 2) Fix RPC arg name for increment_project_views to match code calling supabase.rpc('increment_project_views', { doc_id: ... })
-- Drop the old signature if present, then recreate with correct parameter name
DROP FUNCTION IF EXISTS public.increment_project_views(uuid);

CREATE FUNCTION public.increment_project_views(doc_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.projects
  SET views = views + 1
  WHERE id = doc_id;
$$;

-- Grants (kept consistent with baseline grants; RLS still governs access)
GRANT ALL ON TABLE public.moderation_logs TO anon;
GRANT ALL ON TABLE public.moderation_logs TO authenticated;
GRANT ALL ON TABLE public.moderation_logs TO service_role;

GRANT ALL ON FUNCTION public.increment_project_views(uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_project_views(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_project_views(uuid) TO service_role;

RESET ALL;
