import { describe, expect, it } from 'vitest'
import id from '../../public/locales/id.json'
import nl from '../../public/locales/nl.json'

// test-plan.md §7 "i18n completeness": CI asserts id.json/nl.json have
// identical key sets, so a missing translation fails the build instead of
// shipping a blank string in production.
function flattenKeys(obj: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flattenKeys(value, path)) keys.add(nested)
    } else {
      keys.add(path)
    }
  }
  return keys
}

describe('i18n locale parity', () => {
  it('id.json and nl.json expose the same key set', () => {
    const idKeys = flattenKeys(id)
    const nlKeys = flattenKeys(nl)

    const onlyInId = [...idKeys].filter((k) => !nlKeys.has(k))
    const onlyInNl = [...nlKeys].filter((k) => !idKeys.has(k))

    expect(onlyInId, `keys missing from nl.json: ${onlyInId.join(', ')}`).toEqual([])
    expect(onlyInNl, `keys missing from id.json: ${onlyInNl.join(', ')}`).toEqual([])
  })
})
