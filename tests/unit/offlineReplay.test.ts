import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `replayQueue` is the one place offline correctness actually lives:
 * it must refresh the session before replaying (a queue left overnight
 * can outlive the access token), replay oldest-first, treat a murajaah
 * unique-violation as "already delivered" rather than an error, and let
 * one bad entry fail without blocking the rest.
 */
const { supabaseMock, queueMock, submitAttendanceMock, confirmPracticeMock } = vi.hoisted(() => ({
  supabaseMock: { auth: { getSession: vi.fn() } },
  queueMock: { list: vi.fn(), remove: vi.fn(), markAttempt: vi.fn() },
  submitAttendanceMock: vi.fn(),
  confirmPracticeMock: vi.fn(),
}))

vi.mock('../../src/lib/supabase', () => ({ supabase: supabaseMock }))
vi.mock('../../src/lib/offlineQueue', () => ({ offlineQueue: queueMock }))
vi.mock('../../src/features/attendance/api', () => ({ submitAttendance: submitAttendanceMock }))
vi.mock('../../src/features/murajaah/api', () => ({ confirmPractice: confirmPracticeMock }))

const { replayQueue } = await import('../../src/lib/offlineReplay')

const SESSION = { access_token: 'a-token' }

function entry(overrides: Partial<{ id: string; kind: 'attendance' | 'murajaah'; payload: unknown }>) {
  return { id: 'e1', kind: 'attendance' as const, payload: {}, createdAt: '2026-08-16T09:00:00.000Z', attempts: 0, ...overrides }
}

beforeEach(() => {
  supabaseMock.auth.getSession.mockResolvedValue({ data: { session: SESSION } })
  queueMock.list.mockResolvedValue([])
  queueMock.remove.mockResolvedValue(undefined)
  queueMock.markAttempt.mockResolvedValue(undefined)
  submitAttendanceMock.mockResolvedValue(undefined)
  confirmPracticeMock.mockResolvedValue({ id: 'log1' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('replayQueue', () => {
  it('does nothing when there is no session', async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } })
    await replayQueue()
    expect(queueMock.list).not.toHaveBeenCalled()
  })

  it('refreshes the session before listing the queue', async () => {
    await replayQueue()
    expect(supabaseMock.auth.getSession).toHaveBeenCalled()
    expect(queueMock.list).toHaveBeenCalled()
  })

  it('replays an attendance entry and removes it on success', async () => {
    const e = entry({ kind: 'attendance', payload: [{ session_id: 's1' }] })
    queueMock.list.mockResolvedValue([e])

    await replayQueue()

    expect(submitAttendanceMock).toHaveBeenCalledWith([{ session_id: 's1' }])
    expect(queueMock.remove).toHaveBeenCalledWith('e1')
    expect(queueMock.markAttempt).not.toHaveBeenCalled()
  })

  it('replays a murajaah entry and removes it on success', async () => {
    const e = entry({ kind: 'murajaah', payload: { assignment_id: 'a1' } })
    queueMock.list.mockResolvedValue([e])

    await replayQueue()

    expect(confirmPracticeMock).toHaveBeenCalledWith({ assignment_id: 'a1' })
    expect(queueMock.remove).toHaveBeenCalledWith('e1')
  })

  it('treats a murajaah unique-violation as already delivered, not an error', async () => {
    const e = entry({ kind: 'murajaah', payload: {} })
    queueMock.list.mockResolvedValue([e])
    confirmPracticeMock.mockRejectedValue({ code: '23505', message: 'duplicate key' })

    await replayQueue()

    expect(queueMock.remove).toHaveBeenCalledWith('e1')
    expect(queueMock.markAttempt).not.toHaveBeenCalled()
  })

  it('records a real murajaah failure instead of dropping the entry', async () => {
    const e = entry({ kind: 'murajaah', payload: {} })
    queueMock.list.mockResolvedValue([e])
    const rlsDenied = { code: '42501', message: 'permission denied' }
    confirmPracticeMock.mockRejectedValue(rlsDenied)

    await replayQueue()

    expect(queueMock.remove).not.toHaveBeenCalled()
    expect(queueMock.markAttempt).toHaveBeenCalledWith(e, rlsDenied)
  })

  it('one failing entry does not block the next', async () => {
    const bad = entry({ id: 'e1', kind: 'murajaah', payload: { n: 1 } })
    const good = entry({ id: 'e2', kind: 'attendance', payload: [{ n: 2 }] })
    queueMock.list.mockResolvedValue([bad, good])
    confirmPracticeMock.mockRejectedValue({ code: '42501' })

    await replayQueue()

    expect(queueMock.markAttempt).toHaveBeenCalledWith(bad, { code: '42501' })
    expect(submitAttendanceMock).toHaveBeenCalledWith([{ n: 2 }])
    expect(queueMock.remove).toHaveBeenCalledWith('e2')
  })
})
