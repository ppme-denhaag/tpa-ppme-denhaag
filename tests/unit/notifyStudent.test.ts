import { describe, expect, it, vi } from 'vitest'
import {
  buildAudiences,
  dispatch,
  type DispatchDeps,
  type StudentAudience,
  reportable,
  type StudentRow,
  type UserRow,
} from '../../netlify/functions/lib/notifyStudent'
import type { SendResult } from '../../netlify/functions/lib/webPush'

const SUB = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
})

const parent = (id: string, locale: 'id' | 'nl' = 'id'): UserRow => ({
  id,
  role: 'parent',
  locale,
  push_sub: SUB(id),
})

const student = (over: Partial<StudentRow> = {}): StudentRow => ({
  id: 'student-1',
  full_name: 'Ali Rahman',
  parent_id: 'parent-1',
  user_id: null,
  ...over,
})

describe('who receives a notification about a child', () => {
  it('sends to the child’s own parent', () => {
    const [audience] = buildAudiences([student()], [parent('parent-1')], 'parent')
    expect(audience.recipients.map((r) => r.userId)).toEqual(['parent-1'])
    expect(audience.childFullName).toBe('Ali Rahman')
  })

  it('NEVER pairs a child with another family’s parent', () => {
    // The property test-plan §1 calls "a GDPR incident, not a bug".
    // Two families' rows arrive in one batch — a class roster — and each
    // child must resolve to their own parent only.
    const audiences = buildAudiences(
      [
        student({ id: 'child-a', full_name: 'Ali', parent_id: 'parent-1' }),
        student({ id: 'child-b', full_name: 'Fatimah', parent_id: 'parent-2' }),
      ],
      [parent('parent-1'), parent('parent-2')],
      'parent',
    )

    expect(audiences[0].recipients.map((r) => r.userId)).toEqual(['parent-1'])
    expect(audiences[1].recipients.map((r) => r.userId)).toEqual(['parent-2'])
    for (const audience of audiences) {
      expect(audience.recipients).toHaveLength(1)
    }
  })

  it('adds the 16+ student only for a family audience', () => {
    const rows = [student({ user_id: 'student-user-1' })]
    const users = [parent('parent-1'), { ...parent('student-user-1'), role: 'student' as const }]

    expect(buildAudiences(rows, users, 'parent')[0].recipients.map((r) => r.userId)).toEqual([
      'parent-1',
    ])
    expect(buildAudiences(rows, users, 'family')[0].recipients.map((r) => r.userId)).toEqual([
      'parent-1',
      'student-user-1',
    ])
  })

  it('does not notify the same account twice', () => {
    // Defensive: if a 16+ student's own account were also recorded as
    // the parent contact, a family audience must still be one delivery.
    const audiences = buildAudiences(
      [student({ parent_id: 'user-1', user_id: 'user-1' })],
      [parent('user-1')],
      'family',
    )
    expect(audiences[0].recipients).toHaveLength(1)
  })

  it('skips accounts that cannot receive notifications', () => {
    // A tutor or admin should never be a recipient even if a
    // subscription somehow reached their row (ADR-015(a)).
    const users: UserRow[] = [
      { ...parent('parent-1'), role: 'tutor' },
      { ...parent('parent-2'), role: 'admin' },
    ]
    const audiences = buildAudiences(
      [student({ parent_id: 'parent-1' }), student({ id: 's2', parent_id: 'parent-2' })],
      users,
      'family',
    )
    expect(audiences.flatMap((a) => a.recipients)).toEqual([])
  })

  it('skips accounts with no usable subscription', () => {
    const users: UserRow[] = [
      { ...parent('parent-1'), push_sub: null },
      { ...parent('parent-2'), push_sub: { endpoint: 'http://not-https.example' } },
      { ...parent('parent-3'), push_sub: 'nonsense' },
    ]
    const rows = [
      student({ id: 's1', parent_id: 'parent-1' }),
      student({ id: 's2', parent_id: 'parent-2' }),
      student({ id: 's3', parent_id: 'parent-3' }),
    ]
    expect(buildAudiences(rows, users, 'parent').flatMap((a) => a.recipients)).toEqual([])
  })

  it('keeps a student with no reachable parent in the result, with no recipients', () => {
    // The caller reports "no push subscription" rather than "no such
    // student", and a class fan-out must not drop the rest of the roster
    // because one family is unsubscribed.
    const audiences = buildAudiences(
      [student({ id: 's1', parent_id: 'parent-1' }), student({ id: 's2', parent_id: 'parent-2' })],
      [parent('parent-2')],
      'parent',
    )
    expect(audiences).toHaveLength(2)
    expect(audiences[0].recipients).toEqual([])
    expect(audiences[1].recipients.map((r) => r.userId)).toEqual(['parent-2'])
  })
})

function target(over: Partial<StudentAudience> = {}): StudentAudience {
  return {
    studentId: 'student-1',
    childFullName: 'Ali Rahman',
    recipients: [{ userId: 'parent-1', locale: 'id', subscription: SUB('parent-1') }],
    ...over,
  }
}

const fakeClient = {} as Parameters<typeof dispatch>[0]

function deps(over: Partial<DispatchDeps> = {}): DispatchDeps & { cleared: string[] } {
  const cleared: string[] = []
  return {
    send: async (): Promise<SendResult> => ({ status: 'sent' }),
    clearSubscription: async (userId: string) => {
      cleared.push(userId)
    },
    cleared,
    ...over,
  }
}

describe('dispatching to a fanned-out audience', () => {
  it('sends one payload per recipient, each in their own locale', async () => {
    const sent: { body: string; tag: string }[] = []
    const d = deps({
      send: async (_sub, payload) => {
        sent.push({ body: payload.body, tag: payload.tag })
        return { status: 'sent' }
      },
    })

    await dispatch(
      fakeClient,
      [
        target({
          recipients: [
            { userId: 'parent-1', locale: 'id', subscription: SUB('a') },
            { userId: 'self-1', locale: 'nl', subscription: SUB('b') },
          ],
        }),
      ],
      'newAssignment',
      '2026-03-10',
      d,
    )

    expect(sent.map((s) => s.body)).toEqual([
      'Ada tugas baru untuk Ali',
      'Er is een nieuwe opdracht voor Ali',
    ])
    expect(sent.map((s) => s.tag)).toEqual([
      'newAssignment:parent-1:student-1:2026-03-10',
      'newAssignment:self-1:student-1:2026-03-10',
    ])
  })

  it('gives one parent two siblings two distinct tags, so neither is swallowed', async () => {
    // ADR-016. With the child missing from the tag these two collapsed
    // to one lock-screen notification, and the parent was told about
    // whichever child happened to be dispatched last.
    const sent: string[] = []
    const d = deps({
      send: async (_sub, payload) => {
        sent.push(payload.tag)
        return { status: 'sent' }
      },
    })

    await dispatch(
      fakeClient,
      [
        target({ studentId: 'ali', childFullName: 'Ali Rahman' }),
        target({ studentId: 'zainab', childFullName: 'Zainab Rahman' }),
      ],
      'absence',
      '2026-03-10',
      d,
    )

    expect(sent).toEqual(['absence:parent-1:ali:2026-03-10', 'absence:parent-1:zainab:2026-03-10'])
    expect(new Set(sent).size).toBe(2)
  })

  it('names each child correctly across a whole class', async () => {
    const sent: string[] = []
    const d = deps({
      send: async (_sub, payload) => {
        sent.push(payload.body)
        return { status: 'sent' }
      },
    })

    await dispatch(
      fakeClient,
      [
        target({ childFullName: 'Ali Rahman', recipients: [{ userId: 'p1', locale: 'id', subscription: SUB('a') }] }),
        target({ childFullName: 'Zainab Putri', recipients: [{ userId: 'p2', locale: 'id', subscription: SUB('b') }] }),
      ],
      'newAssignment',
      '2026-03-10',
      d,
    )

    expect(sent).toEqual(['Ada tugas baru untuk Ali', 'Ada tugas baru untuk Zainab'])
  })

  it('one dead subscription does not cost the others their notification', async () => {
    const d = deps({
      send: async (sub) =>
        sub.endpoint.endsWith('dead') ? { status: 'gone' } : { status: 'sent' },
    })

    const result = await dispatch(
      fakeClient,
      [
        target({ recipients: [{ userId: 'p1', locale: 'id', subscription: SUB('dead') }] }),
        target({ recipients: [{ userId: 'p2', locale: 'id', subscription: SUB('alive') }] }),
      ],
      'absence',
      '2026-03-10',
      d,
    )

    expect(result.sent).toBe(1)
    expect(result.expired).toBe(1)
    expect(result.failed).toBe(0)
    expect(d.cleared).toEqual(['p1'])
  })

  it('one failed send does not stop the rest either', async () => {
    const d = deps({
      send: async (sub) =>
        sub.endpoint.endsWith('bad')
          ? { status: 'failed', statusCode: 500, message: 'push service error' }
          : { status: 'sent' },
    })

    const result = await dispatch(
      fakeClient,
      [
        target({ recipients: [{ userId: 'p1', locale: 'id', subscription: SUB('bad') }] }),
        target({ recipients: [{ userId: 'p2', locale: 'id', subscription: SUB('ok') }] }),
      ],
      'absence',
      '2026-03-10',
      d,
    )

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    // A failure is not an expiry: the subscription must survive a bad
    // minute at the push service.
    expect(d.cleared).toEqual([])
  })

  it('delivers to a whole class without exceeding the concurrency bound', async () => {
    let inFlight = 0
    let peak = 0
    const d = deps({
      send: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight -= 1
        return { status: 'sent' }
      },
    })

    const roster = Array.from({ length: 30 }, (_, i) =>
      target({
        studentId: `s${i}`,
        recipients: [{ userId: `p${i}`, locale: 'id', subscription: SUB(`e${i}`) }],
      }),
    )

    const result = await dispatch(fakeClient, roster, 'newAssignment', '2026-03-10', d)

    expect(result.sent).toBe(30)
    expect(peak).toBeGreaterThan(1) // actually parallel, not sequential
    expect(peak).toBeLessThanOrEqual(10) // …but bounded
  })

  it('reports nothing sent for an audience with no recipients', async () => {
    const d = deps({ send: vi.fn() })
    const result = await dispatch(fakeClient, [target({ recipients: [] })], 'absence', '2026-03-10', d)
    expect(result).toEqual({ sent: 0, expired: 0, failed: 0, tags: [] })
    expect(d.send).not.toHaveBeenCalled()
  })
})

describe('reportable — what a Function may put in its HTTP response', () => {
  it('drops the tags, which carry a user id and a student id each', () => {
    // ADR-016. The scheduled Functions carry no shared secret and
    // answer unauthenticated HTTP under `netlify dev`, so the response
    // body is not a place for identifiers.
    const result = reportable({
      sent: 2,
      expired: 0,
      failed: 0,
      tags: ['absence:parent-1:ali:2026-03-10', 'absence:parent-1:zainab:2026-03-10'],
    })
    expect(result).toEqual({ sent: 2, expired: 0, failed: 0 })
    expect(JSON.stringify(result)).not.toContain('parent-1')
    expect(JSON.stringify(result)).not.toContain('ali')
  })

  it('keeps the skip reason, which is what a Netlify log is read for', () => {
    expect(
      reportable({ sent: 0, expired: 0, failed: 0, tags: [], skipped: 'no push subscription' }),
    ).toEqual({ sent: 0, expired: 0, failed: 0, skipped: 'no push subscription' })
  })
})
