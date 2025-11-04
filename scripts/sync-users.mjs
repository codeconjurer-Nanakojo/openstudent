#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const exportPath = path.join(ROOT, 'exports', 'users.json')

  // Load .env.server into process.env (non-destructive) without external deps
  const envServerPath = path.join(ROOT, '.env.server')
  try {
    const raw = await fs.readFile(envServerPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      // Remove surrounding quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
    console.log(`[sync-users] Loaded environment from .env.server`)
  } catch (e) {
    console.warn('[sync-users] .env.server not found or unreadable; relying on existing environment')
  }

  // Prefer REMOTE_* variables; gracefully fall back to VITE_* if provided
  const url = process.env.REMOTE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.REMOTE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('[sync-users] Missing REMOTE_SUPABASE_URL or REMOTE_SUPABASE_SERVICE_ROLE_KEY in environment.')
    console.error('Set them in .env or export them in your shell, then re-run:')
    console.error('  node scripts/sync-users.mjs')
    process.exit(1)
  }

  console.log(`[sync-users] Syncing users to remote Supabase project at ${url || '(missing URL)'} ...`)

  let file
  try {
    file = await fs.readFile(exportPath, 'utf8')
  } catch (err) {
    console.error(`[sync-users] Failed to read ${exportPath}. Have you run scripts/export-users.sh?`)
    throw err
  }

  /** @type {{ id: string, email: string, role: string, full_name: string | null, is_verified: boolean }[]} */
  const users = JSON.parse(file)
  console.log(`[sync-users] Loaded ${users.length} users from exports/users.json`)

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'openstudent-sync-users/1.0' } }
  })

  // Helper to find a user by email using Admin API (list + filter on client)
  async function findAuthUserByEmail(email) {
    let page = 1
    const perPage = 200
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      const match = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
      if (match) return match
      if (data.users.length < perPage) return null
      page += 1
    }
  }

  for (const u of users) {
    const email = (u.email || '').trim()
    if (!email) {
      console.warn('[sync-users] Skipping user with empty email:', u)
      continue
    }

    try {
      // Ensure auth user exists (idempotent)
      let authUser = await findAuthUserByEmail(email)
      if (!authUser) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: 'TempPass123!',
          email_confirm: true,
          user_metadata: { full_name: u.full_name ?? null }
        })
        if (error) {
          // If already exists race condition, re-fetch by email
          if (error?.message?.toLowerCase().includes('already') || error?.status === 422) {
            authUser = await findAuthUserByEmail(email)
          } else {
            throw error
          }
        } else {
          authUser = data.user
        }
      }

      if (!authUser) {
        console.error(`[sync-users] Could not ensure auth user for ${email}. Skipping.`)
        continue
      }

      const remoteId = authUser.id
      const name = u.full_name ?? authUser.user_metadata?.full_name ?? null

      // Upsert into public.users with the REMOTE auth id to keep FK alignment
      const { error: upsertErr } = await supabase
        .from('users')
        .upsert(
          [{
            id: remoteId,
            email: email,
            role: u.role || 'viewer',
            full_name: name,
            is_verified: u.is_verified ?? true
          }],
          { onConflict: 'id' }
        )
      if (upsertErr) throw upsertErr

      console.log(`[sync-users] Synced ${email} (auth id ${remoteId})`)
    } catch (e) {
      console.error(`[sync-users] Error syncing ${u.email}:`, e.message || e)
    }
  }

  console.log('[sync-users] Done.')
}

main().catch(err => {
  console.error('[sync-users] Fatal error:', err)
  process.exit(1)
})
