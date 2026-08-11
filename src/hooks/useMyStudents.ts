import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'

export type MyStudent = Pick<Tables<'students'>, 'id' | 'full_name'>

/**
 * Students visible to the caller under the family-role RLS policies —
 * a parent's own children, or a 16+ student's own single record
 * (migration 003, policies `students_parent_read` / `students_self_read`).
 * Used by the parent/student read views; tutors use `useMyClasses` +
 * a class-scoped roster instead.
 */
export function useMyStudents() {
  const [students, setStudents] = useState<MyStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('students')
      .select('id, full_name')
      .order('full_name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        setStudents(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { students, loading, error }
}
