import type { Database } from './database.types'

type MurajaahFrequency = Database['public']['Enums']['murajaah_frequency']

export const FREQUENCY_LABEL_KEY: Record<MurajaahFrequency, string> = {
  daily: 'murajaah.frequencyDaily',
  '3x_week': 'murajaah.frequency3xWeek',
  weekly: 'murajaah.frequencyWeekly',
}

export const FREQUENCY_OPTIONS: MurajaahFrequency[] = ['daily', '3x_week', 'weekly']

/**
 * `murajaah_log.streak_count` (migration 002) is set by the
 * `fn_set_streak_count` trigger on INSERT: it looks up yesterday's row for
 * the same assignment and adds 1, or resets to 1 if there's none. There is
 * no scheduled job that proactively zeroes a streak when a day is missed
 * (Netlify Scheduled Functions don't exist yet for anything in this
 * project, same as the deferred `calculate-streak-resets` function in the
 * TAD's Scheduler table) — the stored streak only ever changes on the next
 * confirmation, not at midnight.
 *
 * This means "today's streak" cannot be asserted as a live number without
 * that missing job: if the most recent log is from 3 days ago with
 * streak_count=7, the true current streak is 0 (the run was broken), but
 * the database still holds 7 until someone confirms again (which would
 * correctly reset it to 1). Rather than fake a live computation that the
 * system can't actually verify, the UI shows the latest log's
 * streak_count *together with its date* (`murajaah.bestStreak`-style
 * "record" framing rather than an assertion of "current"), and separately
 * whether today is already confirmed (`murajaah.notConfirmedToday`).
 * Mirrors the client-side jilid-completion approach in `src/lib/yanbua.ts`
 * — deriving from the latest row rather than introducing a write path
 * that needs infrastructure this project doesn't have yet.
 */
export function isStreakCurrent(latestLogDate: string | null, today: string): boolean {
  if (!latestLogDate) return false
  return latestLogDate === today
}

/**
 * YYYY-MM-DD for the Monday of the local calendar week (Mon–Sun)
 * containing `date`. Used for FR-004's tutor class overview ("this
 * week"'s confirmations) — a fixed Mon-Sun window rather than a rolling
 * 7-day lookback, so the overview resets predictably at the same point
 * every week regardless of what day the tutor happens to open it.
 */
export function startOfWeekLocalDate(date: Date = new Date()): string {
  const day = date.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + diffToMonday)
  const yyyy = monday.getFullYear()
  const mm = String(monday.getMonth() + 1).padStart(2, '0')
  const dd = String(monday.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
