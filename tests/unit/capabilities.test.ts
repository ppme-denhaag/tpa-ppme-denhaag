import { describe, expect, it } from 'vitest'
import {
  NO_CAPABILITIES,
  deriveCapabilities,
  familyLinkFilter,
  fetchFamilyLinks,
  fetchTaughtClasses,
  fetchTutorClassCount,
  type FamilyLink,
  type TaughtClass,
} from '../../src/lib/capabilities'

// Fixed ids, readable at a glance in the assertions below.
const TP = '11111111-1111-4111-8111-111111111111' // tutor of one class, parent of a child in another
const PARENT = '22222222-2222-4222-8222-222222222222'
const STUDENT16 = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'

function link(over: Partial<FamilyLink> = {}): FamilyLink {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    full_name: 'Anak',
    parent_id: PARENT,
    user_id: null,
    ...over,
  }
}

describe('familyLinkFilter — the filter that stops a tutor-parent seeing a class as their children', () => {
  it('asks for both family links, not just parentage', () => {
    // `user_id.eq` is the 16+ self-login student's only link to their
    // own record. Dropping it silently empties every screen for them —
    // they have no `parent_id` row of their own.
    expect(familyLinkFilter(TP)).toBe(`parent_id.eq.${TP},user_id.eq.${TP}`)
  })

  it('refuses anything that is not a UUID', () => {
    // PostgREST's `or=` takes a filter expression as a string, so a
    // value with a comma in it would add a disjunct rather than be
    // compared against. The id always comes from the session today;
    // this is what keeps that true for the next caller.
    expect(() => familyLinkFilter('')).toThrow(/expected a UUID/)
    expect(() => familyLinkFilter(`${TP},role.eq.admin`)).toThrow(/expected a UUID/)
    expect(() => familyLinkFilter('not-a-uuid')).toThrow(/expected a UUID/)
  })
})

describe('deriveCapabilities — relationships in, capabilities out (ADR-019)', () => {
  const base = { familyLinks: [] as FamilyLink[], tutorClassCount: 0 }

  it('gives a parent of two children exactly the parent capability', () => {
    expect(
      deriveCapabilities({
        ...base,
        userId: PARENT,
        role: 'parent',
        familyLinks: [link(), link({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })],
      }),
    ).toEqual({ ...NO_CAPABILITIES, isParentOfAnyone: true })
  })

  it('gives a tutor of one class exactly the tutor capability', () => {
    expect(
      deriveCapabilities({ ...base, userId: TP, role: 'tutor', tutorClassCount: 1 }),
    ).toEqual({ ...NO_CAPABILITIES, isTutorOfAnyClass: true })
  })

  it('gives a 16+ self-login student the self capability and not the parent one', () => {
    // Their row's `parent_id` is their actual parent's id, never their
    // own — reading "I appear in a students row" as parenthood would
    // hand every 16+ student a ChildPicker over themselves.
    expect(
      deriveCapabilities({
        ...base,
        userId: STUDENT16,
        role: 'student',
        familyLinks: [link({ parent_id: OTHER, user_id: STUDENT16 })],
      }),
    ).toEqual({ ...NO_CAPABILITIES, isSelfStudent: true })
  })

  it('gives a tutor-parent the union of both, from one query each', () => {
    // The case this whole change exists for. Note `role: 'parent'` —
    // the tutor capability comes from the class relationship, exactly
    // as the RLS policies do it (RLS-28…RLS-29).
    expect(
      deriveCapabilities({
        ...base,
        userId: TP,
        role: 'parent',
        familyLinks: [link({ parent_id: TP })],
        tutorClassCount: 1,
      }),
    ).toEqual({ ...NO_CAPABILITIES, isParentOfAnyone: true, isTutorOfAnyClass: true })
  })

  it('does not call a tutor with no class assigned a tutor', () => {
    // A newly invited tutor before an admin puts them in a class. The
    // role column says tutor; the relationship does not exist yet, and
    // RLS gives them nothing until it does.
    const caps = deriveCapabilities({ ...base, userId: TP, role: 'tutor', tutorClassCount: 0 })
    expect(caps.isTutorOfAnyClass).toBe(false)
  })

  it('keeps isAdmin a role check, because fn_is_admin() is one', () => {
    // ADR-014's super admin is a granted position, not a relationship.
    // An admin with no children and no class is still an admin…
    expect(deriveCapabilities({ ...base, userId: OTHER, role: 'admin' })).toEqual({
      ...NO_CAPABILITIES,
      isAdmin: true,
    })
    // …and an admin whose own child attends is both, without either
    // capability standing in for the other.
    expect(
      deriveCapabilities({
        ...base,
        userId: OTHER,
        role: 'admin',
        familyLinks: [link({ parent_id: OTHER })],
      }),
    ).toEqual({ ...NO_CAPABILITIES, isAdmin: true, isParentOfAnyone: true })
  })

  it('grants nothing at all when there is no profile yet', () => {
    expect(deriveCapabilities({ ...base, userId: OTHER, role: null })).toEqual(NO_CAPABILITIES)
  })
})

describe('fetchFamilyLinks — the query itself, not just its result', () => {
  function fakeClient(rows: FamilyLink[]) {
    const calls: { table?: string; select?: string; or?: string; order?: string } = {}
    const builder = {
      select(columns: string) {
        calls.select = columns
        return this
      },
      or(filter: string) {
        calls.or = filter
        return this
      },
      order(column: string) {
        calls.order = column
        return Promise.resolve({ data: rows, error: null })
      },
    }
    const client = {
      from(table: string) {
        calls.table = table
        return builder
      },
    } as unknown as Parameters<typeof fetchFamilyLinks>[0]
    return { client, calls }
  }

  it('filters on the relationship instead of trusting RLS to narrow it', () => {
    // The regression this guards: an unfiltered `select` returns the
    // union of all four permissive `students` policies, so a
    // tutor-parent's ChildPicker would list their whole class and an
    // admin's would list the school.
    const { client, calls } = fakeClient([])
    return fetchFamilyLinks(client, TP).then(() => {
      expect(calls.table).toBe('students')
      expect(calls.or).toBe(`parent_id.eq.${TP},user_id.eq.${TP}`)
      expect(calls.order).toBe('full_name')
    })
  })

  it('selects the two link columns the capability derivation needs', () => {
    const { client, calls } = fakeClient([])
    return fetchFamilyLinks(client, TP).then(() => {
      expect(calls.select).toContain('parent_id')
      expect(calls.select).toContain('user_id')
    })
  })

  it('returns the rows as given, in the order the query asked for', () => {
    const rows = [link({ parent_id: TP }), link({ parent_id: OTHER, user_id: TP })]
    const { client } = fakeClient(rows)
    return fetchFamilyLinks(client, TP).then((data) => expect(data).toEqual(rows))
  })

  it('throws the Postgrest error rather than reporting an empty family', () => {
    // A swallowed error here reads as "you have no children", which is
    // indistinguishable on screen from a real empty state.
    const client = {
      from: () => ({
        select: () => ({
          or: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof fetchFamilyLinks>[0]
    return expect(fetchFamilyLinks(client, TP)).rejects.toMatchObject({
      message: 'permission denied',
    })
  })
})

describe('fetchTutorClassCount', () => {
  function fakeClient(count: number) {
    const calls: {
      table?: string
      options?: { count?: string; head?: boolean }
      containsColumn?: string
      containsValue?: unknown
    } = {}
    const client = {
      from(table: string) {
        calls.table = table
        return {
          select(_columns: string, options: { count?: string; head?: boolean }) {
            calls.options = options
            return {
              contains(column: string, value: unknown) {
                calls.containsColumn = column
                calls.containsValue = value
                return Promise.resolve({ count, error: null })
              },
            }
          },
        }
      },
    } as unknown as Parameters<typeof fetchTutorClassCount>[0]
    return { client, calls }
  }

  it('asks whether the caller is in tutor_ids, not how many classes RLS returns', () => {
    // `classes_read` also returns the classes a caller's *children* are
    // in, and every class in the school to an admin — counting its rows
    // would make every parent a tutor.
    const { client, calls } = fakeClient(2)
    return fetchTutorClassCount(client, TP).then((n) => {
      expect(calls.table).toBe('classes')
      expect(calls.containsColumn).toBe('tutor_ids')
      expect(calls.containsValue).toEqual([TP])
      expect(n).toBe(2)
    })
  })

  it('counts without fetching the rows', () => {
    const { client, calls } = fakeClient(0)
    return fetchTutorClassCount(client, TP).then(() => {
      expect(calls.options).toEqual({ count: 'exact', head: true })
    })
  })

  it('treats a null count as no classes', () => {
    const client = {
      from: () => ({
        select: () => ({ contains: () => Promise.resolve({ count: null, error: null }) }),
      }),
    } as unknown as Parameters<typeof fetchTutorClassCount>[0]
    return expect(fetchTutorClassCount(client, TP)).resolves.toBe(0)
  })
})

describe('fetchTaughtClasses — the tutor-side mirror of the same fix', () => {
  const KELAS_A: TaughtClass = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Kelas A',
    schedule: 'Sabtu 10:00-12:00',
  }

  function fakeClient(rows: TaughtClass[]) {
    const calls: {
      table?: string
      select?: string
      containsColumn?: string
      containsValue?: unknown
      order?: string
    } = {}
    const builder = {
      contains(column: string, value: unknown) {
        calls.containsColumn = column
        calls.containsValue = value
        return this
      },
      order(column: string) {
        calls.order = column
        return Promise.resolve({ data: rows, error: null })
      },
    }
    const client = {
      from(table: string) {
        calls.table = table
        return {
          select(columns: string) {
            calls.select = columns
            return builder
          },
        }
      },
    } as unknown as Parameters<typeof fetchTaughtClasses>[0]
    return { client, calls }
  }

  it('asks for the classes the caller is named in, not the ones they may read', () => {
    // `classes_read` also grants the classes a caller's children are in,
    // so an unfiltered select offered a tutor-parent a class they cannot
    // record against — the roster comes back holding their own child
    // alone and the save fails on `fn_my_classes()`.
    const { client, calls } = fakeClient([KELAS_A])
    return fetchTaughtClasses(client, TP, { isAdmin: false }).then((rows) => {
      expect(calls.table).toBe('classes')
      expect(calls.containsColumn).toBe('tutor_ids')
      expect(calls.containsValue).toEqual([TP])
      expect(calls.order).toBe('name')
      expect(rows).toEqual([KELAS_A])
    })
  })

  it('gives an admin every class, since an admin is in no tutor_ids array', () => {
    // ADR-014: admin takes the tutor shape over the whole TPA. Filtering
    // on `tutor_ids` would hand them an empty picker on every recording
    // screen.
    const { client, calls } = fakeClient([KELAS_A])
    return fetchTaughtClasses(client, OTHER, { isAdmin: true }).then((rows) => {
      expect(calls.containsColumn).toBeUndefined()
      expect(calls.order).toBe('name')
      expect(rows).toEqual([KELAS_A])
    })
  })

  it('throws rather than presenting an empty picker', () => {
    const client = {
      from: () => ({
        select: () => ({
          contains: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof fetchTaughtClasses>[0]
    return expect(fetchTaughtClasses(client, TP, { isAdmin: false })).rejects.toMatchObject({
      message: 'permission denied',
    })
  })
})
