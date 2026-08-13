import { supabase } from '../lib/supabase'

// Local-only convenience: signs into the local Supabase stack (started via
// `supabase start`) as one of the seeded fixture users, without going
// through real Google OAuth — the local stack has no OAuth provider
// configured (see README "Local Postgres"). Mints a JWT client-side using
// the Supabase CLI's well-known default local JWT secret (not a real
// secret — it's the same fixed value baked into every `supabase init`
// project) and hands it to supabase-js via `setSession`.
//
// This module is only ever imported from DevAuthSwitcher, which is only
// rendered when `import.meta.env.DEV` — Vite dead-code-eliminates that
// whole branch (and this module) out of production builds.

const LOCAL_DEV_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

export interface FixtureUser {
  id: string
  label: string
}

// Matches supabase/dev-fixture.sql — see README "Local Postgres" for how
// to load it into a local `supabase start` stack.
export const FIXTURE_USERS: FixtureUser[] = [
  { id: 'a1000000-0000-0000-0000-000000000001', label: 'Ustadz Ahmad (Tutor — Kelas A + B)' },
  // Second tutor, assigned to Kelas B only — the fixture's one way to
  // check a tutor's class scoping from the browser rather than by hand
  // with a minted JWT.
  { id: 'b1000000-0000-0000-0000-000000000001', label: 'Ustadz Baru (Tutor — Kelas B only)' },
  { id: 'a2000000-0000-0000-0000-000000000001', label: 'Ibu Siti (Parent — 3 children)' },
  { id: 'a2000000-0000-0000-0000-000000000002', label: 'Bapak Rudi (Parent — 1 child)' },
  { id: 'a3000000-0000-0000-0000-000000000001', label: 'Fatimah (Santri, 16+ self-login)' },
  { id: 'c1000000-0000-0000-0000-000000000001', label: 'Admin Dev (Admin)' },
]

function base64UrlFromBytes(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlFromJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer)
}

async function mintLocalDevJwt(sub: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'supabase-demo',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const data = `${base64UrlFromJson(header)}.${base64UrlFromJson(payload)}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LOCAL_DEV_JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${base64UrlFromBytes(signature)}`
}

export async function signInAsFixtureUser(userId: string): Promise<void> {
  const access_token = await mintLocalDevJwt(userId)
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token: 'local-dev-fixture-refresh-token',
  })
  if (error) throw error
}
