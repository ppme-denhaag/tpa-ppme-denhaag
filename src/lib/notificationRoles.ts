import type { Database } from './database.types'

type UserRole = Database['public']['Enums']['user_role']

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
 * Lives in `src/lib/` rather than beside the Function so the settings
 * screen and `push-subscribe` cannot drift apart: the screen decides
 * whether to offer a toggle, the Function decides whether to honour it,
 * and those two answering differently is how a role ends up with a
 * button that always fails — or worse, a stored subscription nothing
 * sends to. `netlify/functions/` already imports from here
 * (`src/lib/reports.ts`), so this follows the existing direction.
 *
 * TAD ADR-015(a).
 */
export const RECIPIENT_ROLES: readonly UserRole[] = ['parent', 'student']

export function canReceiveNotifications(role: UserRole): boolean {
  return RECIPIENT_ROLES.includes(role)
}
