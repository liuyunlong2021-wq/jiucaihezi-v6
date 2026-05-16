import { describe, expect, it } from 'vitest'
import { compareFileEntries } from '@/utils/fileSort'

describe('file tree sorting', () => {
  const items = [
    { id: 'old', name: '旧会话', updatedAt: 100 },
    { id: 'new', name: '新会话', updatedAt: 300 },
    { id: 'mid', name: '中间会话', updatedAt: 200 },
  ]

  it('sorts by latest update first by default', () => {
    const sorted = [...items].sort((a, b) => compareFileEntries(a, b, 'time-desc'))

    expect(sorted.map(item => item.id)).toEqual(['new', 'mid', 'old'])
  })

  it('can switch to Chinese name sorting', () => {
    const sorted = [...items].sort((a, b) => compareFileEntries(a, b, 'name-asc'))

    expect(sorted.map(item => item.name)).toEqual(['旧会话', '新会话', '中间会话'])
  })
})
