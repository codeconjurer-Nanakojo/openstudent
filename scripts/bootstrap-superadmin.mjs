#!/usr/bin/env node

/*
 Bootstrap a superadmin user in both auth and public.users.

 Usage:
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-superadmin.mjs

 Notes:
 - Requires service role key; DO NOT expose this key in the browser.
 - The script is idempotent: it will create or update the user.
*/

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const email = process.env.SUPERADMIN_EMAIL || 'nanakojo1@openstudent.com'
const password = process.env.SUPERADMIN_PASSWORD || 'Admin@12345.'
const fullName = process.env.SUPERADMIN_FULL_NAME || 'Bootstrap Superadmin'

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

async function main() {
  try {
    // Try to find existing user
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    let user = list.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      })
      if (error) throw error
      user = data.user
      console.log('Created auth user:', user.id)
    } else {
      // Ensure password and email are set/updated
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata||{}), full_name: user.user_metadata?.full_name || fullName }
      })
      if (error) throw error
      user = data.user
      console.log('Updated auth user:', user.id)
    }

    // Upsert profile in public.users with superadmin role
    const { error: upErr } = await admin
      .from('users')
      .upsert({ id: user.id, email, role: 'superadmin', full_name: user.user_metadata?.full_name || fullName, is_verified: true })
    if (upErr) throw upErr

    console.log('Upserted public.users profile as superadmin.')
  } catch (e) {
    console.error('Bootstrap failed:', e?.message || e)
    process.exit(1)
  }
}

main()
