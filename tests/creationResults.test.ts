import { describe, expect, it } from 'vitest'
import {
  canPersistResultUrl,
  isRenderableResultUrl,
  sanitizeCreationResults,
} from '@/utils/creationResults'

describe('creation result URL handling', () => {
  it('rejects truncated data URLs before they reach media tags', () => {
    const broken = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...[truncated]'

    expect(isRenderableResultUrl(broken)).toBe(false)
    expect(sanitizeCreationResults([{ url: broken, type: 'image', model: 'm', task: 't', ts: 1 }])).toEqual([])
  })

  it('keeps long remote URLs but does not persist oversized data URLs', () => {
    const remote = `https://cdn.example.com/${'a'.repeat(800)}.png`
    const largeData = `data:image/png;base64,${'a'.repeat(800)}`

    expect(canPersistResultUrl(remote)).toBe(true)
    expect(canPersistResultUrl(largeData)).toBe(false)
  })
})
