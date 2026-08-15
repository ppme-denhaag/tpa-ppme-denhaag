import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The class roster every recording screen is built on.
 *
 * Small, and worth pinning precisely because of who reads it since
 * ADR-019: a tutor-parent's `students` grant is the union of their class
 * and their own children (pgTAP RLS-28), so a roster query that leaned on
 * RLS to scope itself would put their own child — enrolled in someone
 * else's class — into the register they are marking. The `class_id`
 * filter is what keeps the two apart, and RLS remains the thing that
 * guarantees no answer can include a class that is not theirs.
 */
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }))

vi.mock('../../src/lib/supabase', () => ({ supabase: supabaseMock }))

const { fetchClassRoster } = await import('../../src/lib/roster')

const KELAS_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function stubQuery(rows: unknown[], error: unknown = null) {
  const calls: { table?: string; select?: string; eqColumn?: string; eqValue?: unknown; order?: string } =
    {}
  supabaseMock.from.mockImplementation((table: string) => {
    calls.table = table
    return {
      select(columns: string) {
        calls.select = columns
        return {
          eq(column: string, value: unknown) {
            calls.eqColumn = column
            calls.eqValue = value
            return {
              order(column: string) {
                calls.order = column
                return Promise.resolve({ data: error ? null : rows, error })
              },
            }
          },
        }
      },
    }
  })
  return calls
}

beforeEach(() => supabaseMock.from.mockReset())

describe('fetchClassRoster', () => {
  it('asks for one class by id, ordered by name', () => {
    const calls = stubQuery([{ id: 's1', full_name: 'Ali' }])
    return fetchClassRoster(KELAS_A).then((rows) => {
      expect(calls.table).toBe('students')
      // Names only. A register does not need a date of birth or a
      // parent's id, and what a screen loads is part of data
      // minimisation, not only what it displays.
      expect(calls.select).toBe('id, full_name')
      expect(calls.eqColumn).toBe('class_id')
      expect(calls.eqValue).toBe(KELAS_A)
      expect(calls.order).toBe('full_name')
      expect(rows).toEqual([{ id: 's1', full_name: 'Ali' }])
    })
  })

  it('returns an empty roster rather than null for a class with nobody in it', () => {
    stubQuery([])
    return expect(fetchClassRoster(KELAS_A)).resolves.toEqual([])
  })

  it('throws rather than rendering an empty register', () => {
    // An empty register is something a tutor would mark and save. A
    // failed load has to look like a failure.
    stubQuery([], { message: 'permission denied' })
    return expect(fetchClassRoster(KELAS_A)).rejects.toMatchObject({
      message: 'permission denied',
    })
  })
})
