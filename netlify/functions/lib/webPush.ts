import webpush from 'web-push'
import type { Json } from '../../../src/lib/database.types'
import type { PushPayload } from './notifications'

/**
 * A stored `users.push_sub` value. Matches the browser's
 * `PushSubscription.toJSON()` shape, which is what `push-subscribe`
 * accepts and validates before it ever reaches the column.
 */
export interface StoredSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
  expirationTime?: number | null
}

export type SendResult =
  /** Delivered to the push service (which does not mean displayed). */
  | { status: 'sent' }
  /**
   * The push service says this subscription is dead (404/410). The
   * caller must clear `users.push_sub` — a subscription is invalidated
   * by the browser on permission revoke, profile reset, or reinstall,
   * and a stale one otherwise costs a failed request on every send
   * forever.
   */
  | { status: 'gone' }
  | { status: 'failed'; statusCode?: number; message: string }

export function isValidSubscription(value: unknown): value is StoredSubscription {
  if (!value || typeof value !== 'object') return false
  const sub = value as Record<string, unknown>
  if (typeof sub.endpoint !== 'string') return false

  // Push services are all HTTPS; anything else is either junk or an
  // attempt to point the sender somewhere it shouldn't go.
  let url: URL
  try {
    url = new URL(sub.endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // Endpoints are short; a multi-kilobyte one is not a real subscription.
  if (sub.endpoint.length > 1024) return false

  const keys = sub.keys as Record<string, unknown> | undefined
  if (!keys || typeof keys !== 'object') return false
  if (typeof keys.p256dh !== 'string' || keys.p256dh.length === 0 || keys.p256dh.length > 256) return false
  if (typeof keys.auth !== 'string' || keys.auth.length === 0 || keys.auth.length > 256) return false

  return true
}

/**
 * Normalizes to exactly the three fields we store — a client cannot get
 * extra keys persisted into the jsonb column by sending them. Typed as
 * `Json` because that is what the `push_sub` column accepts.
 */
export function normalizeSubscription(sub: StoredSubscription): Json {
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  }
}

export function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let configured = false

function configure(): void {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not configured')
  // The `mailto:` subject is what a push service contacts if our sends
  // start misbehaving; it is part of the VAPID spec, not optional.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:info@ppmedenhaag.nl',
    publicKey,
    privateKey,
  )
  configured = true
}

export async function sendPush(
  subscription: StoredSubscription,
  payload: PushPayload,
): Promise<SendResult> {
  configure()
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60 * 12, // half a day: a "not present today" notice is worthless tomorrow
      urgency: 'normal',
    })
    return { status: 'sent' }
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) return { status: 'gone' }
    return {
      status: 'failed',
      statusCode,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
