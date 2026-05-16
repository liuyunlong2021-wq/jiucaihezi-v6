import { describe, expect, it } from 'vitest'
import { collectVaultConversations } from '@/utils/vaultOrganize'

describe('vault organize grouping', () => {
  it('groups conversation pairs by vault and skips unbound sessions', () => {
    const result = collectVaultConversations(
      [
        { id: 'zero', vaultId: 'vault_zero', agentId: 'writer' },
        { id: 'storm', vaultId: 'vault_storm', agentId: 'writer' },
        { id: 'loose', agentId: 'writer' },
      ],
      [
        {
          id: 'zero',
          items: [
            { id: 'u1', role: 'user', content: '零的主角是谁' },
            { id: 'a1', role: 'assistant', content: '林烬是主角' },
          ],
        },
        {
          id: 'storm',
          items: [
            { id: 'u2', role: 'user', content: '风暴项目主角是谁' },
            { id: 'a2', role: 'assistant', content: '沈岚是主角' },
          ],
        },
        {
          id: 'loose',
          items: [
            { id: 'u3', role: 'user', content: '无绑定内容' },
            { id: 'a3', role: 'assistant', content: '不应入库' },
          ],
        },
      ],
    )

    expect(result.skippedSessionIds).toEqual(['loose'])
    expect(result.groups).toHaveLength(2)
    expect(result.groups.find(g => g.vaultId === 'vault_zero')?.pairs[0].text).toContain('林烬')
    expect(result.groups.find(g => g.vaultId === 'vault_storm')?.pairs[0].text).toContain('沈岚')
    expect(result.groups.find(g => g.vaultId === 'vault_zero')?.pairs[0].text).not.toContain('沈岚')
  })
})
