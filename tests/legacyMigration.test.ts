import { describe, expect, it } from 'vitest'
import { planLegacyKnowledgeMigration } from '@/utils/legacyVaultMigration'

describe('legacy vault migration', () => {
  it('assigns old knowledge with session metadata to that session vault', () => {
    const plan = planLegacyKnowledgeMigration(
      [
        {
          id: 'k1',
          category: 'knowledge',
          name: '会话知识',
          content: '来自零项目',
          skillId: 'writer',
          metadata: { sessionId: 'sess_zero' },
        },
      ],
      [{ id: 'sess_zero', vaultId: 'vault_zero' }],
    )

    expect(plan.updates[0].patch.vaultId).toBe('vault_zero')
    expect(plan.updates[0].patch.metadata?.migrationBucket).toBe('session-vault')
  })

  it('archives global and skill-only legacy knowledge without binding it to a vault', () => {
    const plan = planLegacyKnowledgeMigration(
      [
        { id: 'global', category: 'knowledge', name: '全局旧资料', content: '旧资料', skillId: 'general' },
        { id: 'skill', category: 'knowledge', name: '搭子旧资料', content: '旧资料', skillId: 'writer' },
        { id: 'loose', category: 'knowledge', name: '未分类', content: '旧资料' },
      ],
      [],
    )

    expect(plan.updates).toHaveLength(3)
    expect(plan.updates.every(update => update.patch.vaultId === undefined)).toBe(true)
    expect(plan.updates.map(update => update.patch.metadata?.migrationBucket)).toEqual([
      'global-legacy',
      'skill-legacy',
      'uncategorized-legacy',
    ])
  })
})
