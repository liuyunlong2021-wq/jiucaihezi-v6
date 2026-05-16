import { describe, expect, it } from 'vitest'
import {
  buildVaultIndexEntries,
  buildKnowledgeMarkdown,
  lintVaultKnowledge,
  parseCompilerJson,
  rankVaultKnowledge,
  type VaultKnowledgeCandidate,
} from '@/utils/vaultCompilerCore'

describe('vault compiler core', () => {
  it('builds readable markdown pages with frontmatter metadata', () => {
    const now = 1747212345678
    const markdown = buildKnowledgeMarkdown({
      title: '林烬',
      pageType: 'character',
      status: 'developing',
      confidence: 'high',
      tags: ['主角', '失忆'],
      sources: ['sess_zero_user_1', 'sess_zero_assistant_1'],
      updatedAt: now,
      body: '第七码头的修理工，真实身份是失忆特工。',
    })

    expect(markdown).toContain('---')
    expect(markdown).toContain('pageType: character')
    expect(markdown).toContain('tags: [主角, 失忆]')
    expect(markdown).toContain('# 林烬')
    expect(markdown).toContain('第七码头的修理工')
  })

  it('parses compiler JSON into pages, entities, and relations', () => {
    const parsed = parseCompilerJson(`\n\`\`\`json\n{
      "pages": [{"title": "林烬", "pageType": "character", "body": "主角"}],
      "entities": [{"name": "零号档案", "entityType": "object", "summary": "核心谜团"}],
      "relations": [{"from": "林烬", "to": "零号档案", "relation": "寻找"}]
    }\n\`\`\``)

    expect(parsed.pages).toHaveLength(1)
    expect(parsed.entities[0].name).toBe('零号档案')
    expect(parsed.relations[0].relation).toBe('寻找')
  })

  it('ranks page title matches above raw keyword matches', () => {
    const items: VaultKnowledgeCandidate[] = [
      {
        id: 'raw',
        title: '零号碎片',
        content: '林烬 林烬 林烬',
        kind: 'raw',
        updatedAt: 300,
      },
      {
        id: 'page',
        title: '林烬',
        content: '角色页',
        kind: 'page',
        updatedAt: 100,
      },
    ]

    const ranked = rankVaultKnowledge('林烬是谁', items)

    expect(ranked[0].id).toBe('page')
  })

  it('builds a vault index and reports broken graph relations', () => {
    const items: VaultKnowledgeCandidate[] = [
      { id: 'p1', title: '林烬', content: '主角', kind: 'page', updatedAt: 100 },
      { id: 'e1', title: '林烬', content: '角色实体', kind: 'entity', updatedAt: 110 },
      { id: 'r1', title: '林烬 - 寻找 - 零号档案', content: '关系', kind: 'relation', updatedAt: 120 },
    ]

    const index = buildVaultIndexEntries(items)
    const issues = lintVaultKnowledge(items)

    expect(index.map(item => item.title)).toEqual(['林烬', '林烬', '林烬 - 寻找 - 零号档案'])
    expect(issues.some(issue => issue.category === '关系缺失实体')).toBe(true)
  })
})
