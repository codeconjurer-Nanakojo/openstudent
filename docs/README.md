# OpenStudent

## Database: Migration-Driven Workflow

This project now uses Supabase migrations to manage all database changes. Do not edit `backend/db/schema.sql` directly. Instead, create a new migration and apply it locally.

### Quick Start (Local)

1. Install the Supabase CLI and start services.
2. Reset the local database to the current baseline and seed data:
   - `supabase db reset`
3. Run the app and smoke test core flows (auth, RLS, uploads, analytics).

### Local vs Remote Environments

- **.env (local development)**
  - Used by Vite and the frontend at dev time.
  - Expected keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - Never include a service role key here.

- **.env.server (remote project for Node scripts)**
  - Used by backend/Node-only tooling like `scripts/sync-users.mjs`.
  - Preferred keys: `REMOTE_SUPABASE_URL`, `REMOTE_SUPABASE_SERVICE_ROLE_KEY`, optionally `REMOTE_SUPABASE_ANON_KEY`.
  - Backwards-compatible fallback: `VITE_SUPABASE_URL` and `VITE_SUPABASE_SERVICE_ROLE_KEY` will be detected if `REMOTE_*` are not present.

Switching:

- Frontend (Vite): dev uses `.env` automatically; production builds should only expose `VITE_*` public values. Do not ship service role keys to the browser.
- Node scripts: read `.env.server` automatically; no changes required when switching environments.

### Making Schema Changes

1. Create a new migration:
   - `supabase migration new <short_change_name>`
3. Apply locally and load seed data:
   - `supabase db reset`
4. Commit the migration files under `supabase/migrations/` to Git.

### Seed Data

- Seed script lives at `supabase/seed.sql`.
- The seed file no longer inserts any data. Use the frontend (admin dashboard and public flows) to create initial users, universities, programs, courses, and projects.

### Bootstrapping Superadmin

A migration now idempotently bootstraps the superadmin profile by upserting from `auth.users` into `public.users` for the email `nanakojo1@openstudent.com`.

Step-by-step (local):

1. **Reset**: `supabase db reset` (applies migrations, including the bootstrap upsert).
2. **Register**: In the running app, sign up via the frontend with email `nanakojo1@openstudent.com`.
3. **Auto‑promote**:
   - The migration upsert promotes this account to `role = 'superadmin'` when it runs and finds the auth user.
   - If you registered after the last reset (i.e., the auth user didn’t exist during step 1), simply re-run the bootstrap SQL (idempotent) using the Supabase SQL editor or psql by executing the file `supabase/migrations/<timestamp>_bootstrap_superadmin.sql` to promote immediately. Alternatively, the next time migrations are applied (e.g., another reset in a throwaway local), the user will be promoted automatically.

Notes:

- **Auth presence prerequisite**: If the auth user isn’t present yet, register via the frontend first so the migration’s upsert can find it.
- **RLS/Triggers**: This migration keeps RLS on `public.users` and does not modify the role‑enforcement trigger (which runs on UPDATE). It only upserts the `public.users` row.

Optional legacy approach:

- You may still use the Node script at `scripts/bootstrap-superadmin.mjs` with a service role key to create the auth user and profile in one step, but it’s not required for local development anymore.

### Syncing Users to Remote Supabase

This flow exports local `public.users` and syncs them to a remote Supabase project using the Admin API.

Steps:

1. **Export local users**:
   - Ensure local Supabase is running (`supabase start`) and your local DB has users.
   - Run `scripts/export-users.sh`.
   - Outputs: `exports/users.csv` and `exports/users.json`.

2. **Configure remote credentials**:
   - Set in `.env.server` (preferred) or your shell:
     - Preferred: `REMOTE_SUPABASE_URL`, `REMOTE_SUPABASE_SERVICE_ROLE_KEY`
     - Fallback supported: `VITE_SUPABASE_URL`, `VITE_SUPABASE_SERVICE_ROLE_KEY`

3. **Sync to remote**:
   - Run: `node scripts/sync-users.mjs`
   - The script is idempotent. For each user it will:
     - Ensure presence in `auth.users` via `auth.admin.createUser({ email, password: 'TempPass123!', email_confirm: true })` if missing.
     - Upsert into `public.users` with the remote `auth.users.id` and fields `email`, `role`, `full_name`, `is_verified`.

4. **Verify**:
   - In Supabase Studio (remote project), confirm users in both `Authentication > Users` and `public.users` table.

Notes:

- Never insert directly into `auth.users` via SQL; always use the Admin API.
- Default password is `TempPass123!` unless you change it; users should reset via the app.
- The script keeps RLS intact and only uses standard `supabase-js` Admin and table APIs.

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

