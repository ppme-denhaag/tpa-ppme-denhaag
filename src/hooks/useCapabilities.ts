import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchCapabilities, NO_CAPABILITIES, type Capabilities } from '../lib/capabilities'
import { getErrorMessage } from '../lib/errors'

/**
 * What the signed-in person can do, derived from their relationships
 * rather than from `users.role` (TAD ADR-019).
 *
 * Introduced as foundation: nothing in this PR changes what it renders
 * on the strength of these booleans, because every screen's current
 * role check is correct for every user the admin UI can currently
 * create, and swapping them wholesale would change behaviour for people
 * who are only one thing — a `role = 'tutor'` account assigned to no
 * class would stop getting the tutor view. Choosing which screen a
 * dual-role person lands on, and how they move between the two, is a UI
 * decision and belongs to the role-switching PR that follows this one.
 *
 * `NO_CAPABILITIES` while loading is the safe default in both
 * directions: it grants nothing, and because capabilities only decide
 * what to offer — never what data comes back — the worst it can do is
 * show a screen a moment late.
 */
export function useCapabilities() {
  const { session, profile, loading: authLoading } = useAuth()
  const userId = session?.user.id ?? null
  const role = profile?.role ?? null

  const [capabilities, setCapabilities] = useState<Capabilities>(NO_CAPABILITIES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setCapabilities(NO_CAPABILITIES)
      setLoading(authLoading)
      return
    }

    let active = true
    setLoading(true)
    fetchCapabilities(supabase, userId, role)
      .then((next) => {
        if (!active) return
        setCapabilities(next)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setCapabilities(NO_CAPABILITIES)
        setError(getErrorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId, role, authLoading])

  return { capabilities, loading, error }
}
