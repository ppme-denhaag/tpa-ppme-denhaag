import type { ServiceClient } from './callerAuth'
import {
  buildPayload,
  canReceiveNotifications,
  type Locale,
  type NotificationEvent,
  type UserRole,
} from './notifications'
import {
  isValidSubscription,
  sendPush,
  type SendResult,
  type StoredSubscription,
} from './webPush'

/**
 * Who a notification about a given student goes to, and the one place
 * that decides it.
 *
 * Every notification in this system is *about a child*, so "who receives
 * it" is always answered from that child's row — `students.parent_id`,
 * and for a 16+ self-login student their own `students.user_id`. Nothing
 * about the recipient ever comes from the request that triggered the
 * notification.
 *
 * This lives in one module rather than per-Function on purpose. Sending
 * a family a notification about another family's child is the single
 * worst thing this product could do (test-plan §1: "a failure here is a
 * GDPR incident, not a bug"), and the way that happens in practice is
 * the fourth Function to need recipients writing its own slightly
 * different query. There is one query, here, and every sender uses it.
 */
export type Audience =
  /**
   * Parent only — the Notification Spec's default for attendance and
   * progress. A 16+ student does not need a push about their own
   * absence or their own jilid.
   */
  | 'parent'
  /**
   * Parent *and* the 16+ student themselves, where the Spec says
   * "Parent + Student": new homework, and a published year-end report.
   * Most of the TPA is under 16 and has no account, so for them this
   * resolves to the same single recipient as 'parent'.
   */
  | 'family'

export interface Recipient {
  userId: string
  locale: Locale
  subscription: StoredSubscription
}

export interface StudentAudience {
  studentId: string
  childFullName: string
  recipients: Recipient[]
}

/**
 * Resolves the audience for many students in two queries rather than two
 * per student — a new-homework notification fans out across a whole
 * class roster, and a per-student round trip would put the Function's
 * runtime at the mercy of class size.
 */
export interface StudentRow {
  id: string
  full_name: string
  parent_id: string
  user_id: string | null
}

export interface UserRow {
  id: string
  role: UserRole
  locale: Locale
  push_sub: unknown
}

/**
 * The pairing itself, kept pure and separate from the two queries that
 * feed it — this is the logic that decides which account hears about
 * which child, so it is the piece that most needs to be testable
 * exhaustively rather than only through a live push.
 */
export function buildAudiences(
  students: StudentRow[],
  users: UserRow[],
  audience: Audience,
): StudentAudience[] {
  const sendable = new Map<string, Recipient>()
  for (const user of users) {
    // Belt and braces with `push-subscribe`'s own check: a role that
    // never receives notifications is never sent one, even if a
    // subscription somehow reached its row.
    if (!canReceiveNotifications(user.role)) continue
    if (!isValidSubscription(user.push_sub)) continue
    sendable.set(user.id, { userId: user.id, locale: user.locale, subscription: user.push_sub })
  }

  return students.map((student) => {
    const recipients: Recipient[] = []
    const parent = sendable.get(student.parent_id)
    if (parent) recipients.push(parent)
    if (audience === 'family' && student.user_id) {
      const self = sendable.get(student.user_id)
      // A 16+ student who is also their own parent contact would
      // otherwise be sent the same notification twice.
      if (self && self.userId !== student.parent_id) recipients.push(self)
    }
    return { studentId: student.id, childFullName: student.full_name, recipients }
  })
}

export async function audiencesForStudents(
  client: ServiceClient,
  studentIds: string[],
  audience: Audience,
): Promise<StudentAudience[]> {
  if (studentIds.length === 0) return []

  const { data: students, error } = await client
    .from('students')
    .select('id, full_name, parent_id, user_id')
    .in('id', studentIds)
  if (error || !students) return []

  const wanted = new Set<string>()
  for (const student of students) {
    wanted.add(student.parent_id)
    if (audience === 'family' && student.user_id) wanted.add(student.user_id)
  }

  const { data: users, error: usersError } = await client
    .from('users')
    .select('id, role, locale, push_sub')
    .in('id', [...wanted])
  if (usersError) return []

  return buildAudiences(students, users ?? [], audience)
}

export interface DispatchResult {
  sent: number
  /** Subscriptions the push service reported gone; cleared from `users.push_sub`. */
  expired: number
  failed: number
  tags: string[]
}

/**
 * Sends up to `CONCURRENCY` pushes at once.
 *
 * A class of 25 with a parent each is 25 sequential HTTPS round trips to
 * a push service — comfortably enough to reach a serverless function's
 * timeout on a slow day, and the failure mode would be "half the class's
 * parents were told about the homework". Bounded rather than unbounded
 * so a large class does not open a hundred sockets at once either.
 */
const CONCURRENCY = 10

async function pool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/**
 * Builds and sends one payload per recipient — each in that recipient's
 * own locale, each with its own dedup tag — and clears any subscription
 * the push service reports as gone.
 *
 * A failure to one recipient never stops the others: two families, or a
 * parent and their 16+ child, are independent deliveries, and one dead
 * subscription must not cost anyone else their notification.
 */
export interface DispatchDeps {
  send: (subscription: StoredSubscription, payload: ReturnType<typeof buildPayload>) => Promise<SendResult>
  clearSubscription: (userId: string) => Promise<void>
}

export async function dispatch(
  client: ServiceClient,
  targets: StudentAudience[],
  event: NotificationEvent,
  date: string,
  // Injected the same way `publishReportFlow`'s are, and for the same
  // reason: the property that matters here — one dead subscription must
  // not cost anyone else their notification — cannot be produced on
  // demand against a real push service.
  deps: DispatchDeps = {
    send: sendPush,
    clearSubscription: async (userId) => {
      await client.from('users').update({ push_sub: null }).eq('id', userId)
    },
  },
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, expired: 0, failed: 0, tags: [] }

  const deliveries = targets.flatMap((target) =>
    target.recipients.map((recipient) => ({ target, recipient })),
  )

  await pool(deliveries, async ({ target, recipient }) => {
    const payload = buildPayload({
      event,
      locale: recipient.locale,
      childFullName: target.childFullName,
      recipientUserId: recipient.userId,
      date,
    })

    const outcome = await deps.send(recipient.subscription, payload)

    if (outcome.status === 'sent') {
      result.sent += 1
      result.tags.push(payload.tag)
      return
    }

    if (outcome.status === 'gone') {
      result.expired += 1
      await deps.clearSubscription(recipient.userId)
      return
    }

    result.failed += 1
    console.error(`notify: push failed for ${event}`, outcome.statusCode, outcome.message)
  })

  return result
}

export interface NotifyResult extends DispatchResult {
  skipped?: string
}

/** The whole "notify these children's families" path. */
export async function notifyStudents(
  client: ServiceClient,
  args: { studentIds: string[]; event: NotificationEvent; audience: Audience; date: string },
): Promise<NotifyResult> {
  const empty: DispatchResult = { sent: 0, expired: 0, failed: 0, tags: [] }

  const targets = await audiencesForStudents(client, args.studentIds, args.audience)
  if (targets.length === 0) return { ...empty, skipped: 'no such student' }
  if (targets.every((t) => t.recipients.length === 0)) {
    return { ...empty, skipped: 'no push subscription' }
  }

  return dispatch(client, targets, args.event, args.date)
}

export function notifyStudent(
  client: ServiceClient,
  args: { studentId: string; event: NotificationEvent; audience: Audience; date: string },
): Promise<NotifyResult> {
  const { studentId, ...rest } = args
  return notifyStudents(client, { studentIds: [studentId], ...rest })
}
