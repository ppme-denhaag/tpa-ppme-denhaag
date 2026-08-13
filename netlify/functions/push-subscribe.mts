import { authenticateCaller, jsonError, jsonOk } from './lib/callerAuth'
import { canReceiveNotifications } from './lib/notifications'
import { RateLimiter } from './lib/rateLimit'
import { isValidSubscription, normalizeSubscription } from './lib/webPush'

/**
 * Stores (POST) or clears (DELETE) the caller's own Web Push
 * subscription in `users.push_sub`.
 *
 * Why a Function at all, when `users_self_update` (migration 003)
 * already lets a signed-in user write their own row through PostgREST?
 * Three reasons, and no migration was needed for any of them:
 *
 *   1. **Shape validation.** `push_sub` is untyped `jsonb`. Straight
 *      through PostgREST a client could put anything in it, and the
 *      sender would then try to deliver to whatever that was.
 *      `isValidSubscription` is the only gate in front of that column.
 *   2. **Rate limiting** — checklist §6 names this endpoint
 *      specifically. See `lib/rateLimit.ts` for what that does and
 *      honestly does not cover.
 *   3. **Role check.** Notifications are family-facing (ADR-015), so a
 *      subscription is only stored for a role that can actually receive
 *      one. Collecting push endpoints for accounts we will never send to
 *      is personal data with no purpose.
 *
 * A user can only ever write their own row here: the id comes from the
 * validated JWT, never from the request body.
 *
 * No `config.path` export — the default route is what we want, and
 * declaring it breaks `netlify dev` (see README).
 */
const limiter = new RateLimiter({ limit: 12, windowMs: 60_000 })

export default async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return jsonError('Method not allowed', 405)
  }

  const auth = await authenticateCaller(req)
  if ('error' in auth) return auth.error
  const { caller, admin } = auth

  const { allowed, resetAt } = limiter.check(caller.id)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
      },
    })
  }

  if (req.method === 'DELETE') {
    const { error } = await admin.from('users').update({ push_sub: null }).eq('id', caller.id)
    if (error) return jsonError(error.message, 500)
    return jsonOk({ subscribed: false })
  }

  if (!canReceiveNotifications(caller.role)) {
    return jsonError('This role does not receive notifications', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  if (!isValidSubscription(body)) {
    return jsonError('Invalid push subscription', 400)
  }

  const { error } = await admin
    .from('users')
    .update({ push_sub: normalizeSubscription(body) })
    .eq('id', caller.id)
  if (error) return jsonError(error.message, 500)

  return jsonOk({ subscribed: true }, 201)
}
