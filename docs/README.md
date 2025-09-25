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
- Includes two users and sample entities for quick testing:
  - Admin user: `admin@example.com`
  - Contributor user: `contrib@example.com`
  - One university, program, course, and project

### Baseline Migration

- The current schema is captured as baseline migrations in `supabase/migrations/*baseline_schema_part*.sql`.
- Treat the baseline as the production state; future changes must be new migrations.

### Generated Artifact

- `backend/db/schema.sql` is treated as a generated artifact only (do not edit). If kept, it may be regenerated from migrations for reference.

### Verification

- After creating migrations, verify locally:
  - `supabase db reset`
  - Confirm schema builds, seed data loads, and core flows work.

## Contribution Guide

See `docs/CONTRIBUTING.md` for the detailed migration workflow, conventions, and review checklist.

