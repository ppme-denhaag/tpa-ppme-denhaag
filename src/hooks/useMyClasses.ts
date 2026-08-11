import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'

export type ClassOption = Pick<Tables<'classes'>, 'id' | 'name' | 'schedule'>

/**
 * Classes visible to the caller — RLS scopes this to the tutor's own
 * assigned classes (or all classes for admin), no client-side filtering
 * needed (migration 003, policy `classes_read`).
 */
export function useMyClasses() {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('classes')
      .select('id, name, schedule')
      .order('name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        setClasses(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { classes, loading, error }
}
