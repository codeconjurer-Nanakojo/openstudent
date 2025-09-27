# OpenStudent

## Database: Migration-Driven Workflow

This project now uses Supabase migrations to manage all database changes. Do not edit `backend/db/schema.sql` directly. Instead, create a new migration and apply it locally.

### Quick Start (Local)

1. Install the Supabase CLI and start services.
2. Reset the local database to the current baseline and seed data:
   - `supabase db reset`
3. Run the app and smoke test core flows (auth, RLS, uploads, analytics).

### Making Schema Changes

1. Create a new migration:
   - `supabase migration new <short_change_name>`
2. Add SQL to the generated file in `supabase/migrations/`.
3. Apply locally and load seed data:
   - `supabase db reset`
4. Commit the migration files under `supabase/migrations/` to Git.

### Seed Data

- Seed script lives at `supabase/seed.sql`.
- The seed file no longer inserts any data. Use the frontend (admin dashboard and public flows) to create initial users, universities, programs, courses, and projects.

### Baseline Migration

- The current schema is captured as baseline migrations in `supabase/migrations/*baseline_schema_part*.sql`.
- Treat the baseline as the production state; future changes must be new migrations.

### Generated Artifact

- `backend/db/schema.sql` is treated as a generated artifact only (do not edit). If kept, it may be regenerated from migrations for reference.

### Verification

- After creating migrations, verify locally:
  - `supabase db reset`
  - Confirm schema builds, seed data loads, and core flows work.
  - Registration: New users can sign up because `public.users` RLS includes self-insert/select/update policies.

### Frontend initialization notes

- `public/documents.html` now defines and calls `setupAnonPrompt()` within its module script to show a sign-in prompt for anonymous users and to initialize the documents page without undefined function errors.

### RLS: Users table policy guidance

- Policies on `public.users` must not self-reference the `users` table via helper functions that query `users` (e.g., `is_superadmin()`), otherwise PostgREST may recurse when reading `users` and trigger "stack depth limit exceeded".
- Allowed policies on `public.users` are simple, non-recursive:
  - Select: `USING (auth.uid() = id)`
  - Update: `USING (auth.uid() = id)`
  - Insert: `WITH CHECK (auth.uid() = id)`
- Role management is enforced by a trigger on `public.users` for role changes; do not rely on recursive policies on `public.users`.

## Role Hierarchy

- **superadmin**
  - Full admin powers plus the ability to promote/demote any user's `public.users.role`.
  - Can manage all rows in `public.users` (RLS policy `users_superadmin_manage_all`).
  - Only role allowed to change another user's role (enforced by trigger `trg_users_before_update_enforce_role_change`).

- **admin**
  - Full CRUD on content (projects, courses, programs, universities, etc.).
  - Can view all users and toggle their `active` flag, but cannot change `role` (attempts are blocked by the trigger).

- **contributor/viewer**
  - Contributors can manage their own content per existing RLS policies.
  - Anonymous/viewers can read approved public projects and catalog.

### Admin UI visibility

- **Superadmin** sees an extra "Superadmin Tools" section and role dropdowns in the Users tab.
- **Admin** does not see role dropdowns; content management remains available.
- **Contributors/Viewers** cannot access `/admin.html`.

## Contribution Guide

See `docs/CONTRIBUTING.md` for the detailed migration workflow, conventions, and review checklist.

