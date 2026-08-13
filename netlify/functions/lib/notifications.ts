import idCopy from '../../../public/locales/id.json'
import nlCopy from '../../../public/locales/nl.json'
import type { Database } from '../../../src/lib/database.types'

export type Locale = Database['public']['Enums']['locale']
export type UserRole = Database['public']['Enums']['user_role']

/**
 * Who this system sends notifications to — and, because a push
 * subscription is itself personal data, who it will store one for.
 *
 * Every row in the TAD's Notification Spec is addressed to a parent or
 * to a 16+ student: notifications are family-facing by design. A tutor
 * finds out about an absence by recording it, and admin is not exempt
 * from that just because ADR-014 made it a super admin — that decision
 * granted read/write access to the *screens*, which is not the same
 * thing as subscribing one account to two hundred children's lock
 * screens, and would be hard to defend under data minimization.
 *
 * `push-subscribe` therefore refuses to store a subscription for a role
 * that would never be sent one, rather than collecting dead personal
 * data, and the settings screen explains that instead of offering a
 * toggle that does nothing. TAD ADR-015.
 */
export const RECIPIENT_ROLES: readonly UserRole[] = ['parent', 'student']

export function canReceiveNotifications(role: UserRole): boolean {
  return RECIPIENT_ROLES.includes(role)
}

/**
 * Every push a family can receive. The names match the keys under
 * `notifications.push` in both locale files — `pushBody()` below relies
 * on that, and `tests/unit/notifications.test.ts` asserts the two sets
 * stay identical in both locales, so adding an event without adding its
 * copy fails the suite rather than shipping an empty notification.
 *
 * Only `absence` is wired to a sender today (`notify-absence.mts`); the
 * rest are built here so the payload rules — and their tests — exist
 * once, before the scheduled Functions that will use them.
 */
export const NOTIFICATION_EVENTS = [
  'absence',
  'newAssignment',
  'assignmentDueTomorrow',
  'jilidMilestone',
  'surahMemorized',
  'murajaahReminder',
  'reportReady',
] as const

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

/**
 * Where tapping the notification lands. Deliberately a route the
 * recipient is authorized to see anyway — the deep link carries no data
 * of its own, so a link leaked with the payload reveals nothing that the
 * app wouldn't already gate behind RLS.
 */
const EVENT_URL: Record<NotificationEvent, string> = {
  absence: '/attendance',
  newAssignment: '/assignments',
  assignmentDueTomorrow: '/assignments',
  jilidMilestone: '/yanbua',
  surahMemorized: '/murajaah',
  murajaahReminder: '/murajaah',
  reportReady: '/reports',
}

const COPY: Record<Locale, { app: { name: string }; notifications: { push: Record<string, string> } }> = {
  id: idCopy,
  nl: nlCopy,
}

/**
 * The *only* child-specific value a push payload can carry.
 *
 * DPIA risk R6 (lock screens are the threat model): a notification may
 * name the child and say what kind of thing happened, and nothing else.
 * No absence reason — that field can carry health data (DPIA R4) — no
 * grades, no page/ayah positions, no tutor notes, no assignment titles.
 *
 * This is enforced structurally rather than by review: `buildPayload`
 * accepts no field that could carry those details, so there is no
 * channel through which one could reach a payload even by mistake. The
 * copy under `notifications.push` is held to the same rule mechanically
 * — the unit suite rejects any string there that interpolates anything
 * other than `{{name}}`.
 *
 * The richer copy the TAD's Notification Spec table drafted (jilid
 * number, surah name, assignment title) is not lost: it stays under
 * `notifications.*` as the *in-app* wording, shown once the recipient is
 * authenticated. See TAD ADR-015.
 */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

export interface PayloadInput {
  event: NotificationEvent
  /** The recipient's own `users.locale` — never the sender's, never a default. */
  locale: Locale
  /** The child's `students.full_name`; reduced to a first name here. */
  childFullName: string
  /** Recipient's `users.id`, for the dedup tag. */
  recipientUserId: string
  /** Europe/Amsterdam calendar date (YYYY-MM-DD) — see `amsterdamDate`. */
  date: string
}

export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
  icon: string
}

/**
 * Dedup tag, per (user, event type, date) — test-plan §4.3.
 *
 * Two jobs. In the browser, a repeat notification with the same tag
 * replaces the earlier one instead of stacking, so a family sees one
 * "not present today" line however many times the pipeline fires. On the
 * server it is the idempotency key that makes an hourly scheduled
 * Function safe to run more than once in a day (TAD ADR-015's DST
 * approach depends on exactly this).
 */
export function dedupTag(event: NotificationEvent, recipientUserId: string, date: string): string {
  return `${event}:${recipientUserId}:${date}`
}

function interpolate(template: string, name: string): string {
  return template.replace(/\{\{\s*name\s*\}\}/g, name)
}

export function pushBody(event: NotificationEvent, locale: Locale, childFullName: string): string {
  const template = COPY[locale].notifications.push[event]
  if (!template) throw new Error(`Missing push copy for "${event}" in locale "${locale}"`)
  return interpolate(template, firstName(childFullName))
}

export function buildPayload(input: PayloadInput): PushPayload {
  return {
    title: COPY[input.locale].app.name,
    body: pushBody(input.event, input.locale, input.childFullName),
    tag: dedupTag(input.event, input.recipientUserId, input.date),
    url: EVENT_URL[input.event],
    icon: '/icons/icon-192.png',
  }
}

const AMSTERDAM = 'Europe/Amsterdam'

/**
 * The project's timezone truth, and the reason it exists:
 *
 * Netlify cron expressions are UTC-only, and the TAD's original
 * scheduler table pinned them to CET (`0 17 * * *` = 18:00). That is
 * 19:00 local for the ~7 months of CEST, which covers the whole TPA
 * summer term. Rather than choose which half of the year to be wrong
 * in, the scheduled Functions run *hourly* and decide for themselves
 * whether it is the target hour in Amsterdam — which these two helpers
 * answer correctly on both sides of a DST switch, because the runtime's
 * IANA database, not arithmetic, does the work. TAD ADR-015.
 *
 * `date` is also what the dedup tag is keyed on, so "today" means the
 * family's today, not UTC's.
 */
export function amsterdamDate(now: Date = new Date()): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function amsterdamHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: AMSTERDAM,
    hour: '2-digit',
    hour12: false,
  }).format(now)
  return Number(hour)
}

/** True when `now` falls in the given Amsterdam local hour (0–23). */
export function isAmsterdamHour(targetHour: number, now: Date = new Date()): boolean {
  return amsterdamHour(now) === targetHour
}
