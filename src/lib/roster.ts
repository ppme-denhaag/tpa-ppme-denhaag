import { supabase } from './supabase'

export interface RosterStudent {
  id: string
  full_name: string
}

/** Students in a tutor/admin's class — RLS scopes this via `fn_my_classes()`. */
export async function fetchClassRoster(classId: string): Promise<RosterStudent[]> {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('class_id', classId)
    .order('full_name')
  if (error) throw error
  return data ?? []
}
