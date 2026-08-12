import { describe, expect, it } from 'vitest'
import { isStreakCurrent, startOfWeekLocalDate } from '../../src/lib/murajaah'

describe('isStreakCurrent', () => {
  it('is current when the latest log date is today', () => {
    expect(isStreakCurrent('2026-08-12', '2026-08-12')).toBe(true)
  })

  it('is not current when the latest log date is before today', () => {
    expect(isStreakCurrent('2026-08-10', '2026-08-12')).toBe(false)
  })

  it('is not current when there is no log at all', () => {
    expect(isStreakCurrent(null, '2026-08-12')).toBe(false)
  })
})

describe('startOfWeekLocalDate', () => {
  it('returns the same date when given a Monday', () => {
    expect(startOfWeekLocalDate(new Date('2026-08-10T09:00:00'))).toBe('2026-08-10')
  })

  it('returns the preceding Monday for a mid-week date', () => {
    expect(startOfWeekLocalDate(new Date('2026-08-12T09:00:00'))).toBe('2026-08-10')
  })

  it('returns the preceding Monday for a Sunday (end of the Mon-Sun week)', () => {
    expect(startOfWeekLocalDate(new Date('2026-08-16T09:00:00'))).toBe('2026-08-10')
  })
})
