/**
 * Live Web Push verification harness — test-plan §6, "Desktop Chrome"
 * column.
 *
 * Everything about push is easy to *believe* is working: the Function
 * returns 200, the row has a subscription, the logs look fine, and
 * nothing ever arrives on a phone. So this drives the whole pipeline
 * with nothing stubbed — a real Chromium, a real FCM subscription, a
 * real attendance write, the real database webhook, a real push — and
 * asserts on what the browser actually displayed.
 *
 * It is not part of `npm test`: it needs Docker, a loaded dev fixture
 * and a running `netlify dev`, none of which CI has. Run it by hand
 * after touching anything in the notification path.
 *
 *   supabase start
 *   supabase db reset --local
 *   docker exec -i supabase_db_tpa-ppme-denhaag \
 *     psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev-fixture.sql
 *   # configure the webhook target (README "Database webhooks"):
 *   docker exec -i supabase_db_tpa-ppme-denhaag psql -U postgres -c \
 *     "select vault.create_secret('http://host.docker.internal:8888/.netlify/functions','notify_webhook_base_url');
 *      select vault.create_secret('dev-webhook-secret-local-only','notify_webhook_secret');"
 *   npm run build && netlify dev --dir dist --port 8888
 *   node scripts/verify-push.mjs
 *
 * The `.env` used by `netlify dev` must point at the local stack and set
 * VAPID_PUBLIC_KEY / VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY and
 * NOTIFY_WEBHOOK_SECRET (matching the Vault secret above).
 */
import { chromium } from '@playwright/test'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGIN = process.env.VERIFY_ORIGIN ?? 'http://localhost:8888'
const WEBHOOK_SECRET = process.env.NOTIFY_WEBHOOK_SECRET ?? 'dev-webhook-secret-local-only'
// The Supabase CLI's well-known fixed local JWT secret — not a real
// secret (same value in every `supabase init` project). Also used by
// `src/dev/devAuth.ts`.
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_tpa-ppme-denhaag'

// supabase/dev-fixture.sql
const SITI = { id: 'a2000000-0000-0000-0000-000000000001', email: 'ibu.siti@dev.local' }
const RUDI = { id: 'a2000000-0000-0000-0000-000000000002', email: 'bapak.rudi@dev.local' }
const AHMAD = { id: 'a1000000-0000-0000-0000-000000000001', email: 'ustadz.ahmad@dev.local' }
const ADMIN = { id: 'c1000000-0000-0000-0000-000000000001', email: 'admin.dev@dev.local' }
const ALI = 'a5000000-0000-0000-0000-000000000001' // Ibu Siti's child, Kelas A
const FATIMAH = 'a5000000-0000-0000-0000-000000000003' // Bapak Rudi's child, Kelas A

const sql = (query) =>
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-tAc', query], {
    encoding: 'utf8',
  }).trim()

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function mintJwt(sub) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase-demo',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  )
  const data = `${header}.${payload}`
  return `${data}.${b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())}`
}

function sessionJson(user) {
  return JSON.stringify({
    access_token: mintJwt(user.id),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'local-dev-fixture-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  })
}

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const profiles = []
async function openAs(user) {
  // `channel: 'chromium'` is load-bearing: Playwright's default headless
  // shell has no notifications/push implementation, so
  // Notification.permission is permanently 'denied' there and every
  // assertion below would fail for the wrong reason.
  const dir = mkdtempSync(join(tmpdir(), 'tpa-push-'))
  profiles.push(dir)
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    permissions: ['notifications'],
    args: ['--no-sandbox'],
  })
  await context.grantPermissions(['notifications'], { origin: ORIGIN })

  const consoleErrors = []
  const failedRequests = []
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()}`))
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`)
  })
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    'sb-127-auth-token',
    sessionJson(user),
  ])
  await page.goto(`${ORIGIN}/settings/notifications`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  return { context, page, consoleErrors, failedRequests }
}

const shown = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return (await registration.getNotifications()).map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
    }))
  })

const clearTray = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    for (const n of await registration.getNotifications()) n.close()
  })

async function waitForNotification(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  let last = []
  while (Date.now() < deadline) {
    last = await shown(page)
    if (last.length > 0) return last
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return last
}

async function enable(page, label) {
  const button = page.getByRole('button', { name: /Aktifkan notifikasi|Meldingen inschakelen/ })
  await button.waitFor({ timeout: 15000 })
  await button.click()
  await page
    .getByText(/Notifikasi aktif di perangkat ini|Meldingen staan aan op dit apparaat/)
    .waitFor({ timeout: 30000 })
  console.log(`       (${label} subscribed)`)
}

function markAbsent(studentId, reason = null) {
  sql(`
    insert into public.sessions (class_id, date, tutor_id)
    values ((select class_id from public.students where id='${studentId}'), current_date, '${AHMAD.id}')
    on conflict (class_id, date) do nothing;
  `)
  const sessionId = sql(`
    select id from public.sessions
    where class_id = (select class_id from public.students where id='${studentId}')
      and date = current_date limit 1
  `)
  sql(`
    insert into public.attendance (session_id, student_id, status, reason)
    values ('${sessionId}', '${studentId}', 'absent', ${reason ? `'${reason}'` : 'null'})
    on conflict (session_id, student_id) do update set status='absent', reason=excluded.reason;
  `)
}

function markPresent(studentId) {
  sql(`update public.attendance set status='present' where student_id='${studentId}'`)
}

const today = sql("select to_char(current_date, 'YYYY-MM-DD')")

// ── preconditions ────────────────────────────────────────────────
const configured = sql('select base_url is not null and secret is not null from public.fn_webhook_config()')
if (configured !== 't') {
  console.error('Webhook is not configured in Vault — see the header comment in this file.')
  process.exit(2)
}
sql(`update public.users set push_sub = null, locale = 'id' where id in ('${SITI.id}', '${RUDI.id}')`)
sql(`delete from public.attendance where student_id in ('${ALI}', '${FATIMAH}') and session_id in (select id from public.sessions where date = current_date)`)

const siti = await openAs(SITI)
const rudi = await openAs(RUDI)

try {
  console.log('\n1. subscribe → store')
  await enable(siti.page, 'Ibu Siti')
  await enable(rudi.page, 'Bapak Rudi')
  check('subscription stored for Ibu Siti', sql(`select push_sub is not null from public.users where id='${SITI.id}'`) === 't')
  check('subscription stored for Bapak Rudi', sql(`select push_sub is not null from public.users where id='${RUDI.id}'`) === 't')
  check(
    'stored subscription has endpoint + both keys and nothing else',
    sql(`select (select array_agg(k order by k) from jsonb_object_keys(push_sub) k) = array['endpoint','keys']
         from public.users where id='${SITI.id}'`) === 't',
  )

  console.log('\n2. absence → webhook → push → notification')
  const queueMark = sql('select coalesce(max(id),0) from net.http_request_queue')
  markAbsent(ALI, 'demam tinggi')
  check('the database webhook queued one request', Number(sql(`select count(*) from net.http_request_queue where id > ${queueMark}`)) === 1)

  const received = await waitForNotification(siti.page)
  check('Ibu Siti received the absence push', received.length === 1, JSON.stringify(received))
  if (received.length === 1) {
    check('body is the Indonesian copy, first name only', received[0].body === 'Ali tidak hadir hari ini di TPA', received[0].body)
    check('DPIA R6: the absence reason is nowhere in the payload', !JSON.stringify(received[0]).includes('demam'))
    check('dedup tag is per (user, event, date)', received[0].tag === `absence:${SITI.id}:${today}`, received[0].tag)
    check('title is the app name', received[0].title === 'TPA PPME Den Haag', received[0].title)
  }
  check(
    'CROSS-FAMILY: the other parent received nothing (test-plan §1)',
    (await shown(rudi.page)).length === 0,
  )

  console.log('\n3. recipient locale drives the copy')
  sql(`update public.users set locale='nl' where id='${RUDI.id}'`)
  markAbsent(FATIMAH, 'griep')
  const dutch = await waitForNotification(rudi.page)
  check('a Dutch-locale parent gets the Dutch body', dutch.length === 1 && dutch[0].body === 'Fatimah was vandaag niet aanwezig bij TPA', JSON.stringify(dutch))
  check('DPIA R6 holds in Dutch too', !JSON.stringify(dutch).includes('griep'))

  console.log('\n4. dedup and idempotency')
  const mark2 = sql('select coalesce(max(id),0) from net.http_request_queue')
  markAbsent(FATIMAH, 'griep')
  check('re-saving an already-absent roster queues nothing', Number(sql(`select count(*) from net.http_request_queue where id > ${mark2}`)) === 0)
  markPresent(FATIMAH)
  markAbsent(FATIMAH, 'griep')
  await new Promise((resolve) => setTimeout(resolve, 12000))
  check('the same event twice shows one notification, not two', (await shown(rudi.page)).length === 1)

  console.log('\n5. unsubscribe → silence')
  const disable = rudi.page.getByRole('button', { name: /Meldingen uitschakelen|Matikan notifikasi/ })
  await disable.waitFor({ timeout: 15000 })
  await disable.click()
  await rudi.page.getByText(/Meldingen staan uit|Notifikasi tidak aktif/).waitFor({ timeout: 20000 })
  check('unsubscribe clears users.push_sub', sql(`select push_sub is null from public.users where id='${RUDI.id}'`) === 't')

  await clearTray(rudi.page)
  markPresent(FATIMAH)
  markAbsent(FATIMAH)
  await new Promise((resolve) => setTimeout(resolve, 15000))
  check('an unsubscribed parent receives nothing at all', (await shown(rudi.page)).length === 0)

  console.log('\n6. browser health')
  check('no console errors (Ibu Siti)', siti.consoleErrors.length === 0, siti.consoleErrors.join(' | '))
  check('no console errors (Bapak Rudi)', rudi.consoleErrors.length === 0, rudi.consoleErrors.join(' | '))
  check('no failed requests (Ibu Siti)', siti.failedRequests.length === 0, siti.failedRequests.join(' | '))
  check('no failed requests (Bapak Rudi)', rudi.failedRequests.length === 0, rudi.failedRequests.join(' | '))
} finally {
  await siti.context.close()
  await rudi.context.close()
  sql(`update public.users set locale='id' where id='${RUDI.id}'`)
}

console.log('\n7. non-recipient roles (ADR-015)')
for (const [label, user] of [['tutor', AHMAD], ['admin', ADMIN]]) {
  const ctx = await openAs(user)
  try {
    const text = await ctx.page.locator('body').innerText()
    check(`${label}: told plainly that this role receives nothing`, text.includes('Notifikasi TPA ditujukan untuk orang tua dan santri'))
    check(`${label}: no enable button is offered`, (await ctx.page.getByRole('button', { name: /Aktifkan notifikasi/ }).count()) === 0)
    check(`${label}: the lock-screen privacy note is still readable`, text.includes('Apa yang tampil di layar kunci'))
    check(`${label}: no console errors`, ctx.consoleErrors.length === 0, ctx.consoleErrors.join(' | '))
    check(`${label}: no failed requests`, ctx.failedRequests.length === 0, ctx.failedRequests.join(' | '))
  } finally {
    await ctx.context.close()
  }
}

console.log('\n8. endpoint authorization')
const post = (path, init) => fetch(`${ORIGIN}/.netlify/functions/${path}`, init)
const asUser = (user, body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${mintJwt(user.id)}` },
  body: JSON.stringify(body),
})
const VALID_SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'a', auth: 'b' } }

check('push-subscribe refuses a tutor', (await post('push-subscribe', asUser(AHMAD, VALID_SUB))).status === 403)
check('push-subscribe refuses an admin', (await post('push-subscribe', asUser(ADMIN, VALID_SUB))).status === 403)
check('push-subscribe rejects a non-HTTPS endpoint', (await post('push-subscribe', asUser(RUDI, { ...VALID_SUB, endpoint: 'http://evil.example/x' }))).status === 400)
check('push-subscribe rejects junk', (await post('push-subscribe', asUser(RUDI, { nope: true }))).status === 400)
check('push-subscribe requires a session', (await post('push-subscribe', { method: 'POST', body: '{}' })).status === 401)
check('notify-absence rejects a missing webhook secret', (await post('notify-absence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"record":{"id":"x"}}' })).status === 401)
check('notify-absence rejects a wrong webhook secret', (await post('notify-absence', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': 'wrong' }, body: '{"record":{"id":"x"}}' })).status === 401)
check('notify-absence rejects GET', (await post('notify-absence', { method: 'GET' })).status === 405)

const noSub = await post('notify-absence', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
  body: JSON.stringify({ record: { id: sql(`select id from public.attendance where student_id='${FATIMAH}' limit 1`) } }),
})
check('a valid webhook for an unsubscribed parent is a no-op 200', noSub.status === 200 && (await noSub.json()).sent === 0)

for (const dir of profiles) rmSync(dir, { recursive: true, force: true })

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) console.log(failed.map((f) => `  FAILED: ${f.name}`).join('\n'))
process.exit(failed.length === 0 ? 0 : 1)
