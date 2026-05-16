import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestConversation, pinKnowledge, recallKnowledge } from '@/composables/useBrain'

const docs: any[] = [
  {
    id: 'zero',
    category: 'knowledge',
    name: '零号档案',
    content: '林烬正在寻找零号档案',
    vaultId: 'vault_zero',
    skillId: 'writer',
  },
  {
    id: 'storm',
    category: 'knowledge',
    name: '风暴设定',
    content: '林烬在风暴项目里是反派',
    vaultId: 'vault_storm',
    skillId: 'writer',
  },
  {
    id: 'general',
    category: 'knowledge',
    name: '全局旧资料',
    content: '林烬来自全局资料',
    skillId: 'general',
  },
]

vi.mock('@/utils/idb', () => ({
  getAll: vi.fn(async (store: string) => (store === 'documents' ? docs : [])),
  setRecord: vi.fn(async (_store: string, value: any) => {
    docs.push(value)
  }),
}))

const memoryStorage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
  },
  configurable: true,
})

beforeEach(() => {
  localStorage.clear()
  docs.splice(3)
})

describe('brain vault isolation', () => {
  it('injects no knowledge when no vault is bound', async () => {
    const recalled = await recallKnowledge('林烬是谁', { skillId: 'writer' })

    expect(recalled).toBe('')
  })

  it('recalls knowledge only from the active vault', async () => {
    const recalled = await recallKnowledge('林烬是谁', { vaultId: 'vault_zero', skillId: 'writer' })

    expect(recalled).toContain('零号档案')
    expect(recalled).not.toContain('风暴设定')
    expect(recalled).not.toContain('全局旧资料')
  })

  it('pins knowledge inside a vault instead of globally', async () => {
    pinKnowledge('只属于零', '林烬喜欢雨夜', 'vault_zero')

    const zero = await recallKnowledge('无关键词', { vaultId: 'vault_zero' })
    const storm = await recallKnowledge('无关键词', { vaultId: 'vault_storm' })

    expect(zero).toContain('只属于零')
    expect(storm).not.toContain('只属于零')
  })

  it('stores ingested conversation as raw knowledge inside the bound vault', async () => {
    await ingestConversation('writer', '助手: 零号档案新增雨夜设定', {
      vaultId: 'vault_zero',
      sessionId: 'session_zero',
      sourceMessageIds: ['assistant_1'],
    })

    const raw = docs.find(doc => doc.name.includes('对话原料'))
    expect(raw).toMatchObject({
      category: 'knowledge',
      kind: 'raw',
      indexed: false,
      vaultId: 'vault_zero',
      skillId: 'writer',
      sourceSessionId: 'session_zero',
    })
    expect(raw.sourceMessageIds).toEqual(['assistant_1'])
  })

  it('does not persist raw knowledge without a bound vault', async () => {
    await ingestConversation('writer', '助手: 这条不应该进入任何知识库')

    expect(docs).toHaveLength(3)
  })
})
