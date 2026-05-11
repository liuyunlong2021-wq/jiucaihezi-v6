/**
 * composables/useBrain.ts — 长脑子引擎（karpathy-llm-wiki 完全体）
 *
 * 实现 karpathy-llm-wiki 的 raw/ → wiki/ 编译模型：
 *   - raw/: 按搭子归属存储对话原文（immutable source material）
 *   - wiki/: LLM 编译的知识页（durable knowledge pages）
 *   - 两种触发模式: 自动收集 + 手动全局扫描
 *
 * @see https://github.com/Astro-Han/karpathy-llm-wiki
 */
import { ref, computed } from 'vue'
import { resolveApiConfig, buildHeaders } from '@/utils/api'
import type { BrainRawEntry, BrainWikiPage, SkillConfig } from '@/types/skill'

// ─── Reactive state ───
const rawEntries = ref<BrainRawEntry[]>([])
const wikiPages = ref<BrainWikiPage[]>([])
const isProcessing = ref(false)
const currentStep = ref(0) // 0-5
const stepLabels = [
  '',
  '正在阅读你的资料',
  '正在筛选有用经验',
  '正在匹配相关搭子',
  '正在生成增强建议',
  '正在准备结果',
]

export interface BrainSuggestion {
  id: string
  skillId: string
  skillName: string
  type: 'rule' | 'reference' | 'example' | 'trigger'
  content: string
  status: 'pending' | 'accepted' | 'ignored'
}

const suggestions = ref<BrainSuggestion[]>([])

// ─── Storage keys ───
const RAW_KEY = 'jc_brain_raw_v1'
const WIKI_KEY = 'jc_brain_wiki_v1'

function loadRaw(): BrainRawEntry[] {
  try { return JSON.parse(localStorage.getItem(RAW_KEY) || '[]') }
  catch { return [] }
}

function saveRaw(entries: BrainRawEntry[]) {
  localStorage.setItem(RAW_KEY, JSON.stringify(entries))
  rawEntries.value = entries
}

function loadWiki(): BrainWikiPage[] {
  try { return JSON.parse(localStorage.getItem(WIKI_KEY) || '[]') }
  catch { return [] }
}

function saveWiki(pages: BrainWikiPage[]) {
  localStorage.setItem(WIKI_KEY, JSON.stringify(pages))
  wikiPages.value = pages
}

/**
 * 自动模式：对话结束后自动收集到 raw/
 * karpathy-wiki: "Ingest your first source — store in raw/"
 */
export function ingestConversation(
  skillId: string,
  conversation: string
) {
  const entries = loadRaw()
  const entry: BrainRawEntry = {
    id: 'raw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    skillId,
    content: conversation,
    timestamp: Date.now(),
    indexed: false,
  }
  entries.push(entry)
  saveRaw(entries)
}

/**
 * 获取每个搭子的知识状态摘要
 */
export function getSkillBrainStats(skills: SkillConfig[]) {
  const raws = loadRaw()
  const wikis = loadWiki()

  return skills.map(skill => {
    const rawCount = raws.filter(r => r.skillId === skill.id).length
    const wikiCount = wikis.filter(w => w.skillId === skill.id).length
    const unindexed = raws.filter(r => r.skillId === skill.id && !r.indexed).length
    const lastWiki = wikis
      .filter(w => w.skillId === skill.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]

    return {
      skillId: skill.id,
      skillName: skill.name,
      rawCount,
      wikiCount,
      unindexedCount: unindexed,
      lastCompiled: lastWiki?.updatedAt || 0,
    }
  })
}

/**
 * 手动模式：全局扫描未索引对话 → 编译 wiki 页
 * karpathy-wiki: "ingest → compile → query"
 */
export async function runBrainCompilation(
  skills: SkillConfig[]
): Promise<BrainSuggestion[]> {
  isProcessing.value = true
  currentStep.value = 1
  suggestions.value = []

  try {
    const raws = loadRaw()
    const unindexed = raws.filter(r => !r.indexed)

    if (unindexed.length === 0) {
      isProcessing.value = false
      currentStep.value = 0
      return []
    }

    // Step 1: 阅读资料 — 按搭子分组
    const grouped: Record<string, BrainRawEntry[]> = {}
    for (const entry of unindexed) {
      if (!grouped[entry.skillId]) grouped[entry.skillId] = []
      grouped[entry.skillId].push(entry)
    }

    currentStep.value = 2

    // Step 2: 筛选有用经验 — 发送给 LLM 分析
    const config = await resolveApiConfig()
    const allSuggestions: BrainSuggestion[] = []

    for (const [skillId, entries] of Object.entries(grouped)) {
      const skill = skills.find(s => s.id === skillId)
      if (!skill) continue

      currentStep.value = 3

      const conversationText = entries
        .map(e => e.content)
        .join('\n\n---\n\n')
        .slice(0, 8000) // 控制上下文长度

      // karpathy-wiki 编译 prompt
      const compilePrompt = `你是一个知识库编译器（参考 karpathy-llm-wiki 模式）。

## 当前搭子
名称: ${skill.name}
当前 SKILL.md:
${skill.skillContent.slice(0, 2000)}

## 原始对话记录（raw/）
${conversationText}

## 你的任务
分析这些对话记录，提取可以复用的经验，生成增强建议。每条建议必须指明类型：

- **rule**: 应该添加到搭子的工作流程/规则中的新发现
- **reference**: 有价值的参考资料/链接/知识点
- **example**: 典型的好对话案例，可以作为示例
- **trigger**: 用户常用但当前搭子未覆盖的触发词

## 输出格式
严格输出 JSON 数组（不要 markdown）：
[{"type": "rule|reference|example|trigger", "content": "具体内容"}]

如果没有有价值的经验，输出空数组 []。`

      currentStep.value = 4

      try {
        const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.model || 'claude-sonnet-4-6',
            messages: [
              { role: 'system', content: compilePrompt },
              { role: 'user', content: '请分析以上对话记录，提取可复用的经验。' },
            ],
            temperature: 0.3,
            max_tokens: 2000,
            stream: false,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content || '[]'
          const jsonMatch = text.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]) as { type: string; content: string }[]
            for (const item of items) {
              allSuggestions.push({
                id: 'sug_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                skillId,
                skillName: skill.name,
                type: item.type as BrainSuggestion['type'],
                content: item.content,
                status: 'pending',
              })
            }
          }
        }
      } catch (e) {
        console.warn('[Brain] Compile error for skill:', skillId, e)
      }
    }

    currentStep.value = 5

    // 标记已索引
    const updatedRaws = raws.map(r => {
      if (!r.indexed && unindexed.some(u => u.id === r.id)) {
        return { ...r, indexed: true }
      }
      return r
    })
    saveRaw(updatedRaws)

    // 保存 wiki 页
    if (allSuggestions.length > 0) {
      const wikis = loadWiki()
      const newPage: BrainWikiPage = {
        id: 'wiki_' + Date.now().toString(36),
        skillId: '_compilation',
        title: `整理 ${new Date().toLocaleDateString('zh-CN')}`,
        content: allSuggestions.map(s => `[${s.type}] ${s.content}`).join('\n'),
        sources: unindexed.map(e => e.id),
        updatedAt: Date.now(),
      }
      wikis.push(newPage)
      saveWiki(wikis)
    }

    suggestions.value = allSuggestions
    return allSuggestions
  } finally {
    isProcessing.value = false
    currentStep.value = 0
  }
}

/**
 * 采用/忽略建议
 */
export function setSuggestionStatus(id: string, status: 'accepted' | 'ignored') {
  const idx = suggestions.value.findIndex(s => s.id === id)
  if (idx !== -1) suggestions.value[idx].status = status
}

export function acceptAllSuggestions() {
  suggestions.value.forEach(s => {
    if (s.status === 'pending') s.status = 'accepted'
  })
}

export function ignoreAllSuggestions() {
  suggestions.value.forEach(s => {
    if (s.status === 'pending') s.status = 'ignored'
  })
}

/**
 * 知识回忆 — 聊天时自动匹配知识条目注入上下文
 * 移植自 V4 code.html recallKnowledge() (行 17918-17960)
 * 使用 n-gram + CJK 二元组匹配
 */
export function recallKnowledge(userMsg: string, skillId?: string): string {
  const wikis = loadWiki()
  if (!wikis.length || !userMsg.trim()) return ''

  const msg = userMsg.toLowerCase()
  const tokens = new Set<string>()

  // 英文分词
  msg.split(/\s+/).forEach(w => { if (w.length > 1) tokens.add(w) })

  // CJK 二元组（移植自 V4 行 17923-17930）
  const cjkRuns = msg.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || []
  cjkRuns.forEach(run => {
    for (let i = 0; i < run.length; i++) {
      tokens.add(run[i])
      if (i < run.length - 1) tokens.add(run.substring(i, i + 2))
    }
    if (run.length >= 3) tokens.add(run)
  })

  if (tokens.size === 0) return ''

  // 评分每个 wiki 页
  const scored = wikis
    .filter(w => !skillId || w.skillId === skillId || w.skillId === '_compilation')
    .map(wiki => {
      const text = (wiki.title + ' ' + wiki.content).toLowerCase()
      let score = 0
      tokens.forEach(t => {
        if (text.includes(t)) score += t.length // 长 token 权重高
      })
      return { wiki, score }
    })
    .filter(s => s.score > 2) // 最低门槛
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // 最多 3 条

  if (scored.length === 0) return ''

  const lines = scored.map(s => `- ${s.wiki.title}: ${s.wiki.content.slice(0, 200)}`)
  return `\n\n---\n[知识回忆]\n${lines.join('\n')}`
}

/**
 * 将已采用的建议实际应用到搭子的 skillContent
 * BrainPanel 点"采用"后调用
 */
export function getAcceptedSuggestionsBySkill(): Record<string, BrainSuggestion[]> {
  const accepted = suggestions.value.filter(s => s.status === 'accepted')
  const grouped: Record<string, BrainSuggestion[]> = {}
  for (const s of accepted) {
    if (!grouped[s.skillId]) grouped[s.skillId] = []
    grouped[s.skillId].push(s)
  }
  return grouped
}

export function useBrain() {
  // 初始化加载
  rawEntries.value = loadRaw()
  wikiPages.value = loadWiki()

  return {
    rawEntries,
    wikiPages,
    isProcessing,
    currentStep,
    stepLabels,
    suggestions,
    ingestConversation,
    getSkillBrainStats,
    runBrainCompilation,
    setSuggestionStatus,
    acceptAllSuggestions,
    ignoreAllSuggestions,
    recallKnowledge,
    getAcceptedSuggestionsBySkill,
  }
}
