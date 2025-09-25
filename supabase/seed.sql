-- Seed data for local development
-- This script creates two users (admin and contributor) and basic sample entities.
-- Intended to be run automatically by `supabase db reset`.

BEGIN;

-- Generate stable UUIDs for seed users
WITH ids AS (
  SELECT
    '11111111-1111-1111-1111-111111111111'::uuid AS admin_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contrib_id
)
-- Insert into auth.users (local dev)
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT admin_id, 'admin@example.com', now() FROM ids
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT contrib_id, 'contrib@example.com', now() FROM ids
ON CONFLICT (id) DO NOTHING;

-- Users in public schema
INSERT INTO public.users (id, email, role, full_name, is_verified, created_at, updated_at)
SELECT '11111111-1111-1111-1111-111111111111', 'admin@example.com', 'admin', 'Admin User', true, now(), now()
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, role, full_name, is_verified, created_at, updated_at)
SELECT '22222222-2222-2222-2222-222222222222', 'contrib@example.com', 'contributor', 'Contributor User', true, now(), now()
ON CONFLICT (id) DO NOTHING;

-- University
INSERT INTO public.universities (id, name, short_name, location, website_url, logo_url, is_active, created_at, updated_at)
VALUES (
  '33333333-3333-3333-3333-333333333333', 'Open University', 'OU', 'Remote', 'https://example.edu', NULL, true, now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Program
INSERT INTO public.programs (id, name, code, description, university_id, duration_years, is_active, created_at, updated_at)
VALUES (
  '44444444-4444-4444-4444-444444444444', 'Computer Science', 'CS', 'BSc Computer Science', '33333333-3333-3333-3333-333333333333', 4, true, now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Course
INSERT INTO public.courses (id, name, code, description, program_id, level, semester, credits, is_active, created_at, updated_at)
VALUES (
  '55555555-5555-5555-5555-555555555555', 'Intro to Databases', 'CS101', 'Basics of relational DBs', '44444444-4444-4444-4444-444444444444', 100, 1, 3, true, now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Project
INSERT INTO public.projects (id, title, description, abstract, course_id, contributor_id, file_url, file_size, image_url, status, tags, price, download_count, average_rating, review_count, is_featured, is_public, published_at, created_at, updated_at, views, license)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  'Sample Project',
  'A sample project for local testing',
  'Short abstract for sample project',
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'https://example.com/sample.pdf',
  1024,
  NULL,
  'approved',
  ARRAY['sample','seed'],
  0,
  0,
  0,
  0,
  false,
  true,
  now(),
  now(),
  now(),
  0,
  'Unspecified'
)
ON CONFLICT (id) DO NOTHING;

-- A sample review (approved) by admin to test rating update triggers (optional)
INSERT INTO public.project_reviews (id, project_id, reviewer_id, rating, comment, is_verified_download, status, created_at, updated_at)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111',
  5,
  'Great work!',
  false,
  'approved',
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
