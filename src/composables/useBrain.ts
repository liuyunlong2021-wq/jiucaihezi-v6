/**
 * composables/useBrain.ts — 长脑子引擎（karpathy-llm-wiki 完全体）
 *
 * 1:1 移植 Astro-Han/karpathy-llm-wiki SKILL.md 的全部能力:
 *   - raw/: immutable source material
 *   - wiki/: compiled knowledge pages + index + log
 *   - 3 操作: Ingest (+ cascade) / Query (+ archive) / Lint
 *   - 冲突标注 + See Also 交叉引用
 *
 * @see https://github.com/Astro-Han/karpathy-llm-wiki
 */
import { ref, computed } from 'vue'
import { resolveApiConfig, buildHeaders } from '@/utils/api'
import type {
  BrainRawEntry, BrainWikiPage, SkillConfig,
  WikiIndexEntry, WikiLogEntry,
} from '@/types/skill'

// ─── Reactive state ───
const rawEntries = ref<BrainRawEntry[]>([])
const wikiPages = ref<BrainWikiPage[]>([])
const wikiIndex = ref<WikiIndexEntry[]>([])
const wikiLog = ref<WikiLogEntry[]>([])
const isProcessing = ref(false)
const currentStep = ref(0)
const stepLabels = [
  '',
  '正在阅读你的资料',
  '正在筛选有用经验',
  '正在匹配相关搭子',
  '正在生成增强建议',
  '正在级联更新 + 体检',
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

// ─── Lint 结果 ───
export interface LintIssue {
  id: string
  severity: 'auto-fixed' | 'report'
  category: string
  description: string
  pageId?: string
}
const lintResults = ref<LintIssue[]>([])

// ─── Storage keys ───
const RAW_KEY = 'jc_brain_raw_v1'
const WIKI_KEY = 'jc_brain_wiki_v1'
const INDEX_KEY = 'jc_brain_index_v1'
const LOG_KEY = 'jc_brain_log_v1'
const MAX_WIKI_PAGES = 250
const MAX_RAW_ENTRIES = 500
const MAX_MIRROR_CONTENT_CHARS = 4000

function loadRaw(): BrainRawEntry[] {
  try { return JSON.parse(localStorage.getItem(RAW_KEY) || '[]') } catch { return [] }
}
function saveRaw(entries: BrainRawEntry[]) {
  try {
    const json = JSON.stringify(entries)
    // BUG-3 修复: 检查大小，超过 4MB 时截断旧数据而非静默丢失
    if (json.length > 4 * 1024 * 1024) {
      // 保留最新 50%，丢弃最旧的
      const half = Math.floor(entries.length / 2)
      const trimmed = entries.slice(half)
      localStorage.setItem(RAW_KEY, JSON.stringify(trimmed))
      rawEntries.value = trimmed
      console.warn(`[Brain] raw entries 超限，已截断 ${half} 条旧数据`)
      return
    }
    localStorage.setItem(RAW_KEY, json)
    rawEntries.value = entries
  } catch (e) {
    console.error('[Brain] 保存 raw 失败，可能存储已满:', e)
  }
}
function loadWiki(): BrainWikiPage[] {
  try { return JSON.parse(localStorage.getItem(WIKI_KEY) || '[]') } catch { return [] }
}
function saveWiki(pages: BrainWikiPage[]) {
  try {
    const normalized = pages
      .filter(p => p && p.id)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_WIKI_PAGES)
      .map(p => ({ ...p, content: p.content.slice(0, MAX_MIRROR_CONTENT_CHARS) }))
    const json = JSON.stringify(normalized)
    if (json.length > 4 * 1024 * 1024) {
      // 归档最旧的页面
      const sorted = [...normalized].sort((a, b) => a.updatedAt - b.updatedAt)
      const half = Math.floor(sorted.length / 2)
      for (let i = 0; i < half; i++) sorted[i].archived = true
      localStorage.setItem(WIKI_KEY, JSON.stringify(sorted))
      wikiPages.value = sorted
      console.warn(`[Brain] wiki pages 超限，已归档 ${half} 个旧页面`)
      return
    }
    localStorage.setItem(WIKI_KEY, json)
    wikiPages.value = normalized
  } catch (e) {
    console.error('[Brain] 保存 wiki 失败，可能存储已满:', e)
  }
}
function loadIndex(): WikiIndexEntry[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') } catch { return [] }
}
function saveIndex(entries: WikiIndexEntry[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
    wikiIndex.value = entries
  } catch (e) {
    console.error('[Brain] 保存 index 失败:', e)
  }
}
function loadLog(): WikiLogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}
function saveLog(entries: WikiLogEntry[]) {
  try {
    // log 只保留最新 200 条
    const trimmed = entries.length > 200 ? entries.slice(-200) : entries
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed))
    wikiLog.value = trimmed
  } catch (e) {
    console.error('[Brain] 保存 log 失败:', e)
  }
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function appendLog(op: WikiLogEntry['operation'], desc: string, pages: string[] = []) {
  const logs = loadLog()
  logs.push({ id: uid('log'), timestamp: Date.now(), operation: op, description: desc, affectedPages: pages })
  saveLog(logs)
}

function rebuildIndex() {
  const wikis = loadWiki()
  const idx: WikiIndexEntry[] = wikis.map(w => ({
    pageId: w.id, title: w.title, topic: w.topic || 'general',
    summary: w.content.slice(0, 100), updatedAt: w.updatedAt,
  }))
  saveIndex(idx)
}

// ─── Ingest ───
export function ingestConversation(skillId: string, conversation: string) {
  const entries = loadRaw()
  const entry: BrainRawEntry = {
    id: uid('raw'), skillId, content: conversation,
    timestamp: Date.now(), indexed: false,
    collectedAt: Date.now(), topic: 'conversation',
  }
  entries.push(entry)
  saveRaw(entries.slice(-MAX_RAW_ENTRIES))
}

// ─── Stats ───
export function getSkillBrainStats(skills: SkillConfig[]) {
  const raws = loadRaw()
  const wikis = loadWiki()
  return skills.map(skill => {
    const rawCount = raws.filter(r => r.skillId === skill.id).length
    const wikiCount = wikis.filter(w => w.skillId === skill.id).length
    const unindexed = raws.filter(r => r.skillId === skill.id && !r.indexed).length
    const lastWiki = wikis.filter(w => w.skillId === skill.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return { skillId: skill.id, skillName: skill.name, rawCount, wikiCount, unindexedCount: unindexed, lastCompiled: lastWiki?.updatedAt || 0 }
  })
}

// ─── Compile (with Cascade + Conflict) ───
export async function runBrainCompilation(skills: SkillConfig[]): Promise<BrainSuggestion[]> {
  isProcessing.value = true
  currentStep.value = 1
  suggestions.value = []
  try {
    const raws = loadRaw()
    const unindexed = raws.filter(r => !r.indexed)
    if (unindexed.length === 0) { isProcessing.value = false; currentStep.value = 0; return [] }

    const grouped: Record<string, BrainRawEntry[]> = {}
    for (const entry of unindexed) {
      if (!grouped[entry.skillId]) grouped[entry.skillId] = []
      grouped[entry.skillId].push(entry)
    }
    currentStep.value = 2

    const config = await resolveApiConfig()
    const allSuggestions: BrainSuggestion[] = []
    const touchedPageIds: string[] = []
    const successfullyProcessedRawIds = new Set<string>()

    for (const [skillId, entries] of Object.entries(grouped)) {
      const skill = skills.find(s => s.id === skillId)
      if (!skill) continue
      currentStep.value = 3

      // 获取该搭子已有 wiki 页（用于冲突检测）
      const existingWikis = loadWiki().filter(w => w.skillId === skillId && !w.archived)
      const existingContext = existingWikis.length > 0
        ? `\n\n## 已有知识页（检查冲突用）\n${existingWikis.map(w => `### ${w.title}\n${w.content.slice(0, 300)}`).join('\n\n')}`
        : ''

      const conversationText = entries.map(e => e.content).join('\n\n---\n\n').slice(0, 8000)

      const compilePrompt = `你是一个知识库编译器（karpathy-llm-wiki 模式）。

## 当前搭子
名称: ${skill.name}
当前 SKILL.md:
${skill.skillContent.slice(0, 2000)}
${existingContext}

## 原始对话记录（raw/）
${conversationText}

## 你的任务
1. 分析对话记录，提取可复用的经验
2. **冲突检测**: 如果新内容与"已有知识页"矛盾，标注 [CONFLICT: 页面标题] 并说明分歧
3. 生成建议，每条指明类型: rule / reference / example / trigger

## 输出格式
严格输出 JSON 数组:
[{"type": "rule|reference|example|trigger", "content": "具体内容", "conflict": "可选，冲突的页面标题"}]
无有价值经验则输出 []。`

      currentStep.value = 4
      try {
        const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
          method: 'POST', headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.model || 'claude-sonnet-4-6',
            messages: [
              { role: 'system', content: compilePrompt },
              { role: 'user', content: '请分析以上对话记录，提取可复用的经验。' },
            ],
            temperature: 0.3, max_tokens: 2000, stream: false,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.choices?.[0]?.message?.content || '[]'
          const jsonMatch = text.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]) as { type: string; content: string; conflict?: string }[]
            for (const entry of entries) successfullyProcessedRawIds.add(entry.id)
            for (const item of items) {
              allSuggestions.push({
                id: uid('sug'), skillId, skillName: skill.name,
                type: item.type as BrainSuggestion['type'],
                content: item.conflict ? `${item.content}\n[冲突: ${item.conflict}]` : item.content,
                status: 'pending',
              })
            }
          }
        } else {
          console.warn('[Brain] Compile API error:', skillId, res.status)
        }
      } catch (e) { console.warn('[Brain] Compile error:', skillId, e) }
    }

    currentStep.value = 5

    // 标记已索引
    const updatedRaws = raws.map(r => {
      if (!r.indexed && successfullyProcessedRawIds.has(r.id)) return { ...r, indexed: true }
      return r
    })
    saveRaw(updatedRaws)

    // 保存 wiki 页 + Cascade Updates
    if (allSuggestions.length > 0) {
      const wikis = loadWiki()
      const bySkill: Record<string, BrainSuggestion[]> = {}
      for (const suggestion of allSuggestions) {
        if (!bySkill[suggestion.skillId]) bySkill[suggestion.skillId] = []
        bySkill[suggestion.skillId].push(suggestion)
      }
      const newPages: BrainWikiPage[] = Object.entries(bySkill).map(([compiledSkillId, skillSuggestions]) => ({
        id: uid('wiki'),
        skillId: compiledSkillId || '_compilation',
        title: `整理 ${skillSuggestions[0]?.skillName || compiledSkillId} ${new Date().toLocaleDateString('zh-CN')}`,
        content: skillSuggestions.map(s => `[${s.type}] ${s.content}`).join('\n'),
        sources: unindexed.filter(e => e.skillId === compiledSkillId).map(e => e.id),
        updatedAt: Date.now(),
        topic: compiledSkillId || 'compilation',
        seeAlso: [],
        archived: false,
        conflicts: [],
      }))
      const newPage: BrainWikiPage = newPages[0]
      if (!newPage) {
        suggestions.value = allSuggestions
        return allSuggestions
      }

      // Cascade: 检查冲突标注，更新相关页面的 conflicts 字段
      const conflictItems = allSuggestions.filter(s => s.content.includes('[冲突:'))
      for (const ci of conflictItems) {
        const match = ci.content.match(/\[冲突: (.+?)\]/)
        if (match) {
          const conflictTitle = match[1]
          const target = wikis.find(w => w.title.includes(conflictTitle))
          if (target) {
            if (!target.conflicts) target.conflicts = []
            target.conflicts.push(newPage.id)
            newPage.conflicts.push(target.id)
            touchedPageIds.push(target.id)
          }
        }
      }

      // Cascade: 更新同 topic 页面的 seeAlso
      for (const page of newPages) {
        const sameTopic = wikis.filter(w => w.topic === page.topic && w.id !== page.id && !w.archived)
        for (const p of sameTopic) {
          if (!p.seeAlso) p.seeAlso = []
          if (!p.seeAlso.includes(page.id)) p.seeAlso.push(page.id)
          page.seeAlso.push(p.id)
          touchedPageIds.push(p.id)
        }
      }

      wikis.push(...newPages)
      saveWiki(wikis)
      touchedPageIds.push(...newPages.map(p => p.id))
    }

    // Post-Ingest: 更新 index + 追加 log
    rebuildIndex()
    appendLog('ingest', `编译 ${allSuggestions.length} 条建议，来自 ${unindexed.length} 条对话`, touchedPageIds)
    if (touchedPageIds.length > 1) {
      appendLog('cascade', `级联更新 ${touchedPageIds.length - 1} 个相关页面`, touchedPageIds)
    }

    suggestions.value = allSuggestions
    return allSuggestions
  } finally {
    isProcessing.value = false
    currentStep.value = 0
  }
}

// ─── Lint 操作 ───
export function runBrainLint(): LintIssue[] {
  const wikis = loadWiki()
  const idx = loadIndex()
  const issues: LintIssue[] = []
  let autoFixed = 0

  // 确定性检查 1: 索引一致性
  for (const w of wikis) {
    const inIdx = idx.find(i => i.pageId === w.id)
    if (!inIdx) {
      issues.push({ id: uid('lint'), severity: 'auto-fixed', category: '索引缺失', description: `"${w.title}" 存在但未被索引`, pageId: w.id })
      autoFixed++
    }
  }
  for (const i of idx) {
    const exists = wikis.find(w => w.id === i.pageId)
    if (!exists) {
      i.missing = true
      issues.push({ id: uid('lint'), severity: 'auto-fixed', category: '索引指向缺失', description: `索引条目 "${i.title}" 指向不存在的页面`, pageId: i.pageId })
      autoFixed++
    }
  }

  // 确定性检查 2: See Also 有效性
  for (const w of wikis) {
    if (!w.seeAlso) continue
    const broken = w.seeAlso.filter(ref => !wikis.find(p => p.id === ref))
    if (broken.length > 0) {
      w.seeAlso = w.seeAlso.filter(ref => wikis.find(p => p.id === ref))
      issues.push({ id: uid('lint'), severity: 'auto-fixed', category: 'See Also 失效', description: `"${w.title}" 移除 ${broken.length} 个失效引用`, pageId: w.id })
      autoFixed++
    }
  }

  // 确定性检查 3: 同 topic 补充 See Also
  const byTopic: Record<string, BrainWikiPage[]> = {}
  for (const w of wikis) {
    const t = w.topic || 'general'
    if (!byTopic[t]) byTopic[t] = []
    byTopic[t].push(w)
  }
  for (const pages of Object.values(byTopic)) {
    if (pages.length < 2) continue
    for (const p of pages) {
      if (!p.seeAlso) p.seeAlso = []
      for (const other of pages) {
        if (other.id !== p.id && !p.seeAlso.includes(other.id)) {
          p.seeAlso.push(other.id)
          issues.push({ id: uid('lint'), severity: 'auto-fixed', category: 'See Also 补充', description: `"${p.title}" ← → "${other.title}"`, pageId: p.id })
          autoFixed++
        }
      }
    }
  }

  // 启发式检查 1: 孤儿页
  for (const w of wikis) {
    const hasInbound = wikis.some(other => other.id !== w.id && other.seeAlso?.includes(w.id))
    if (!hasInbound && wikis.length > 1) {
      issues.push({ id: uid('lint'), severity: 'report', category: '孤儿页', description: `"${w.title}" 没有任何入站链接`, pageId: w.id })
    }
  }

  // 启发式检查 2: 冲突未解决
  for (const w of wikis) {
    if (w.conflicts && w.conflicts.length > 0) {
      issues.push({ id: uid('lint'), severity: 'report', category: '未解决冲突', description: `"${w.title}" 与 ${w.conflicts.length} 个页面存在事实分歧`, pageId: w.id })
    }
  }

  // 启发式检查 3: 过时页面（超过 30 天未更新）
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  for (const w of wikis) {
    if (Date.now() - w.updatedAt > thirtyDays) {
      issues.push({ id: uid('lint'), severity: 'report', category: '可能过时', description: `"${w.title}" 已 ${Math.floor((Date.now() - w.updatedAt) / (24 * 60 * 60 * 1000))} 天未更新`, pageId: w.id })
    }
  }

  // 保存修复后的数据
  saveWiki(wikis)
  rebuildIndex()
  appendLog('lint', `${issues.length} 个问题，${autoFixed} 个自动修复`, issues.filter(i => i.pageId).map(i => i.pageId!))

  lintResults.value = issues
  return issues
}

// ─── Query 归档 ───
export function archiveQueryResult(title: string, content: string, sourcePageIds: string[], skillId: string) {
  const wikis = loadWiki()
  const archivePage: BrainWikiPage = {
    id: uid('wiki'), skillId, title: `[归档] ${title}`,
    content, sources: [], updatedAt: Date.now(),
    topic: 'archive', seeAlso: sourcePageIds,
    archived: true, conflicts: [],
  }
  wikis.push(archivePage)
  saveWiki(wikis)
  rebuildIndex()
  appendLog('archive', `归档: ${title}`, [archivePage.id])
}

// ─── 建议操作 ───
export function setSuggestionStatus(id: string, status: 'accepted' | 'ignored') {
  const idx = suggestions.value.findIndex(s => s.id === id)
  if (idx !== -1) suggestions.value[idx].status = status
}
export function acceptAllSuggestions() {
  suggestions.value.forEach(s => { if (s.status === 'pending') s.status = 'accepted' })
}
export function ignoreAllSuggestions() {
  suggestions.value.forEach(s => { if (s.status === 'pending') s.status = 'ignored' })
}

// ─── 知识回忆 ───
export function recallKnowledge(userMsg: string, skillId?: string): string {
  const wikis = loadWiki()
  if (!wikis.length || !userMsg.trim()) return ''

  const msg = userMsg.toLowerCase()
  const tokens = new Set<string>()
  msg.split(/\s+/).forEach(w => { if (w.length > 1) tokens.add(w) })

  const cjkRuns = msg.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || []
  cjkRuns.forEach(run => {
    for (let i = 0; i < run.length; i++) {
      tokens.add(run[i])
      if (i < run.length - 1) tokens.add(run.substring(i, i + 2))
    }
    if (run.length >= 3) tokens.add(run)
  })
  if (tokens.size === 0) return ''

  const scored = wikis
    .filter(w => !skillId || w.skillId === skillId || w.skillId === '_compilation')
    .map(wiki => {
      const text = (wiki.title + ' ' + wiki.content).toLowerCase()
      let score = 0
      tokens.forEach(t => { if (text.includes(t)) score += t.length })
      return { wiki, score }
    })
    .filter(s => s.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (scored.length === 0) return ''

  // 记录 query 到 log
  appendLog('query', `回忆匹配 ${scored.length} 条`, scored.map(s => s.wiki.id))

  const lines = scored.map(s => `- ${s.wiki.title}: ${s.wiki.content.slice(0, 200)}`)
  return `\n\n---\n[知识回忆]\n${lines.join('\n')}`
}

// ─── 获取已采用建议（按搭子分组）───
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
  rawEntries.value = loadRaw()
  wikiPages.value = loadWiki()
  wikiIndex.value = loadIndex()
  wikiLog.value = loadLog()

  return {
    rawEntries, wikiPages, wikiIndex, wikiLog,
    isProcessing, currentStep, stepLabels, suggestions, lintResults,
    ingestConversation, getSkillBrainStats, runBrainCompilation,
    setSuggestionStatus, acceptAllSuggestions, ignoreAllSuggestions,
    recallKnowledge, getAcceptedSuggestionsBySkill,
    // karpathy-wiki 完全体新增
    runBrainLint, archiveQueryResult, rebuildIndex,
  }
}
