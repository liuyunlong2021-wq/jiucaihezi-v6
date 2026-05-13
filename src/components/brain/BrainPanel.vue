<script setup lang="ts">
/**
 * BrainPanel.vue — 长脑子面板（简化版）
 * 两个核心按钮：整理 + 反哺
 */
import { ref } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useFileStore } from '@/composables/useFileStore'
import { resolveApiConfig, buildHeaders } from '@/utils/api'
import { getAll } from '@/utils/idb'

const emit = defineEmits<{ (e: 'close'): void }>()
const store = useAgentStore()
const fileStore = useFileStore()

type Phase = 'idle' | 'organizing' | 'feedback' | 'done'
const phase = ref<Phase>('idle')
const progress = ref('')
const error = ref('')

// 反哺建议
interface Suggestion {
  skillId: string
  skillName: string
  type: string
  content: string
  reason: string
  selected: boolean
}
const suggestions = ref<Suggestion[]>([])
const allSelected = ref(false)

// ─── 整理：全量扫描对话 → 提取知识 → 存入知识库 ───
async function runOrganize() {
  phase.value = 'organizing'
  progress.value = '扫描对话记录...'
  error.value = ''

  try {
    // 读取 conversations 获取 agentId 映射
    const conversations = await getAll('conversations') as Array<{ id: string; agentId?: string; title?: string }>
    const convMap: Record<string, string> = {}
    for (const c of conversations) {
      if (c.agentId) convMap[c.id] = c.agentId
    }

    // messages store 中每条记录是 { id: sessionId, items: ChatMessage[] }
    const records = await getAll('messages') as Array<{ id: string; items: Array<{ role: string; content: string; agentId?: string; agentName?: string }> }>
    if (!records || records.length === 0) {
      progress.value = '没有对话记录'
      phase.value = 'done'
      return
    }

    // 展开所有消息，附带 session 的 agentId
    const grouped: Record<string, string[]> = {}
    for (const rec of records) {
      if (!rec.items || !Array.isArray(rec.items)) continue
      const sessionAgentId = convMap[rec.id] || '通用'
      for (let i = 0; i < rec.items.length - 1; i++) {
        const m = rec.items[i]
        const next = rec.items[i + 1]
        if (m.role === 'user' && next?.role === 'assistant') {
          const key = m.agentId || sessionAgentId
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(`用户: ${m.content}\n助手: ${next.content}`)
        }
      }
    }

    const groups = Object.entries(grouped)
    if (groups.length === 0) {
      progress.value = `扫描了 ${records.length} 个会话，未找到有效对话对`
      phase.value = 'done'
      return
    }
    progress.value = `找到 ${groups.length} 组对话（共 ${Object.values(grouped).reduce((a, b) => a + b.length, 0)} 条），开始提取知识...`

    const config = await resolveApiConfig()
    let totalExtracted = 0
    let apiErrors = 0

    for (const [skillId, convos] of groups) {
      const text = convos.slice(-20).join('\n\n---\n\n')
      if (text.length < 100) continue

      progress.value = `正在分析: ${skillId} (${convos.length} 条对话)...`

      try {
        const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.model || 'claude-sonnet-4-6',
            messages: [
              { role: 'system', content: ORGANIZE_PROMPT },
              { role: 'user', content: text.slice(0, 6000) },
            ],
            temperature: 0.3,
            max_tokens: 2000,
            stream: false,
          }),
        })

        if (!res.ok) {
          apiErrors++
          const errBody = await res.text().catch(() => '')
          progress.value = `API 错误 (${res.status}): ${errBody.slice(0, 100)}，跳过 ${skillId}...`
          continue
        }
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''

        if (!content) {
          progress.value = `${skillId}: LLM 返回空内容，跳过...`
          continue
        }

        // 解析 JSON 数组（兼容 markdown code block 包裹）
        const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const entries = JSON.parse(jsonMatch[0])
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (!entry.content && !entry.title) continue
              await fileStore.addKnowledge({
                name: entry.title || '知识点',
                content: entry.content || '',
                topic: entry.topic || skillId,
                skillId,
                indexed: true,
                metadata: { type: entry.type, confidence: entry.confidence },
              })
              totalExtracted++
            }
          }
        } else {
          progress.value = `${skillId}: LLM 返回非JSON格式，跳过...`
        }
      } catch (e: any) {
        apiErrors++
        progress.value = `${skillId}: ${e.message || '请求失败'}，跳过...`
      }
    }

    progress.value = totalExtracted > 0
      ? `整理完成，提取了 ${totalExtracted} 条知识${apiErrors > 0 ? `（${apiErrors} 个错误）` : ''}`
      : `整理完成但未提取到知识${apiErrors > 0 ? `（${apiErrors} 个API错误，请检查余额或网络）` : '（对话内容可能不含可复用知识）'}`
    phase.value = 'done'
  } catch (e: any) {
    error.value = e.message || '整理失败'
    phase.value = 'done'
  }
}

// ─── 反哺：用知识库升级我的搭子 ───
async function runFeedback() {
  phase.value = 'feedback'
  progress.value = '读取知识库...'
  error.value = ''
  suggestions.value = []

  try {
    const knowledge = await fileStore.loadByCategory('knowledge')
    if (knowledge.length === 0) {
      progress.value = '知识库为空，请先整理'
      phase.value = 'done'
      return
    }

    const mySkills = store.getMySkills()
    if (mySkills.length === 0) {
      progress.value = '没有搭子可升级'
      phase.value = 'done'
      return
    }

    const config = await resolveApiConfig()

    for (const skill of mySkills) {
      // 筛选相关知识（按 topic/skillId 匹配）
      const related = knowledge.filter(k =>
        k.skillId === skill.id || k.topic === skill.name || k.topic === skill.id
      )
      if (related.length === 0) continue

      progress.value = `分析搭子: ${skill.name}...`

      const knowledgeText = related.slice(0, 15).map(k => `- [${k.name}] ${k.content}`).join('\n')

      const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-6',
          messages: [
            { role: 'system', content: FEEDBACK_PROMPT },
            { role: 'user', content: `## 当前搭子\n名称: ${skill.name}\nSKILL.md:\n${skill.skillContent?.slice(0, 3000)}\n\n## 相关知识库内容\n${knowledgeText}` },
          ],
          temperature: 0.4,
          max_tokens: 2000,
          stream: false,
        }),
      })

      if (!res.ok) continue
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''

      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0])
          for (const item of items) {
            suggestions.value.push({
              skillId: skill.id,
              skillName: skill.name,
              type: item.type || 'rule',
              content: item.content || '',
              reason: item.reason || '',
              selected: false,
            })
          }
        }
      } catch {}
    }

    progress.value = suggestions.value.length > 0
      ? `生成了 ${suggestions.value.length} 条升级建议`
      : '没有找到可升级的内容'
    phase.value = 'done'
  } catch (e: any) {
    error.value = e.message || '反哺失败'
    phase.value = 'done'
  }
}

function toggleAllSuggestions() {
  allSelected.value = !allSelected.value
  suggestions.value.forEach(s => { s.selected = allSelected.value })
}

function applySelected() {
  const selected = suggestions.value.filter(s => s.selected)
  if (selected.length === 0) return

  // 按搭子分组应用
  const grouped: Record<string, Suggestion[]> = {}
  for (const s of selected) {
    if (!grouped[s.skillId]) grouped[s.skillId] = []
    grouped[s.skillId].push(s)
  }

  for (const [skillId, items] of Object.entries(grouped)) {
    const skill = store.loadSkills().find(s => s.id === skillId)
    if (!skill) continue

    let newContent = skill.skillContent || ''
    for (const item of items) {
      if (item.type === 'rule') {
        newContent += `\n- ${item.content}`
      } else if (item.type === 'example') {
        newContent += `\n\n### 示例\n${item.content}`
      } else if (item.type === 'reference') {
        newContent += `\n- 参考: ${item.content}`
      } else {
        newContent += `\n- ${item.content}`
      }
    }

    store.updateSkill(skillId, {
      skillContent: newContent,
      version: (skill.version || 1) + 1,
    })
  }

  progress.value = `已应用 ${selected.length} 条升级到 ${Object.keys(grouped).length} 个搭子`
  suggestions.value = []
}

// ─── Prompts ───
const ORGANIZE_PROMPT = `你是知识编译引擎（llm-wiki-skill）。从以下对话记录中提取可复用的结构化知识。

## 输出要求
输出一个JSON数组，每个知识点是一个对象：
[
  {
    "title": "知识点标题（一句话描述）",
    "content": "具体内容（规则/方法/示例/模式）",
    "topic": "所属搭子或主题",
    "type": "rule | reference | example | pattern",
    "confidence": "EXTRACTED | INFERRED"
  }
]

## 提取原则
- 只提取可复用的知识，忽略一次性对话
- 优先提取：规则约束、工作流模式、输出格式规范、常见错误修正
- 用 EXTRACTED 标记直接从对话中提取的，INFERRED 标记推断的
- 如果没有可提取的知识，返回空数组 []`

const FEEDBACK_PROMPT = `你是搭子进化引擎（Skill_Seekers）。基于知识库中积累的经验，为搭子提出具体的升级建议。

## 输出要求
输出JSON数组，每项是一条升级建议：
[
  {
    "type": "rule | reference | example | trigger | workflow",
    "content": "具体要添加/修改的内容",
    "reason": "为什么要做这个改动（基于哪条知识）"
  }
]

## 进化原则
- 只建议有知识库证据支持的改动
- 优先加强：规则约束（防止重复错误）、输出格式（提升一致性）、示例（增加覆盖）
- 不要删除现有有效规则
- 如果没有可建议的改动，返回空数组 []`
</script>

<template>
  <div class="bp">
    <div class="bp-head">
      <span class="mso" style="font-size:20px;color:var(--olive)">psychology</span>
      <span class="bp-title">长脑子</span>
      <button class="bp-close" @click="emit('close')"><span class="mso">close</span></button>
    </div>

    <!-- 两个核心按钮 -->
    <div class="bp-actions">
      <button class="bp-action-btn" :disabled="phase === 'organizing'" @click="runOrganize">
        <span class="mso">auto_stories</span>
        <div class="bp-action-info">
          <span class="bp-action-name">整理</span>
          <span class="bp-action-desc">扫描对话记录，提取知识到知识库</span>
        </div>
      </button>
      <button class="bp-action-btn" :disabled="phase === 'feedback'" @click="runFeedback">
        <span class="mso">upgrade</span>
        <div class="bp-action-info">
          <span class="bp-action-name">反哺</span>
          <span class="bp-action-desc">用知识库升级我的搭子</span>
        </div>
      </button>
    </div>

    <!-- 进度 -->
    <div v-if="progress" class="bp-progress">
      <span v-if="phase === 'organizing' || phase === 'feedback'" class="bp-spinner"></span>
      <span>{{ progress }}</span>
    </div>
    <div v-if="error" class="bp-error">{{ error }}</div>

    <!-- 反哺建议列表 -->
    <div v-if="suggestions.length > 0" class="bp-suggestions">
      <div class="bp-sug-head">
        <span>升级建议 ({{ suggestions.length }})</span>
        <button class="bp-sug-all" @click="toggleAllSuggestions">{{ allSelected ? '取消全选' : '全选' }}</button>
      </div>
      <div class="bp-sug-list">
        <div v-for="(s, i) in suggestions" :key="i" class="bp-sug-item" @click="s.selected = !s.selected">
          <input type="checkbox" :checked="s.selected" />
          <div class="bp-sug-content">
            <div class="bp-sug-meta">
              <span class="bp-sug-skill">{{ s.skillName }}</span>
              <span class="bp-sug-type">{{ s.type }}</span>
            </div>
            <div class="bp-sug-text">{{ s.content }}</div>
            <div class="bp-sug-reason">{{ s.reason }}</div>
          </div>
        </div>
      </div>
      <button class="bp-apply-btn" :disabled="!suggestions.some(s => s.selected)" @click="applySelected">
        确认应用 ({{ suggestions.filter(s => s.selected).length }})
      </button>
    </div>
  </div>
</template>

<style scoped>
.bp { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.bp-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.bp-title { font-size: 15px; font-weight: 700; color: var(--ink1); flex: 1; }
.bp-close { border: none; background: none; color: var(--ink3); cursor: pointer; padding: 4px; }
.bp-actions { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.bp-action-btn {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; border-radius: 12px;
  border: 2px solid var(--line); background: var(--paper);
  cursor: pointer; font-family: inherit; text-align: left;
  transition: all .15s;
}
.bp-action-btn:hover { border-color: var(--olive); box-shadow: 0 2px 8px rgba(0,0,0,.05); }
.bp-action-btn:disabled { opacity: .5; cursor: not-allowed; }
.bp-action-btn .mso { font-size: 28px; color: var(--olive); flex-shrink: 0; }
.bp-action-info { display: flex; flex-direction: column; gap: 2px; }
.bp-action-name { font-size: 15px; font-weight: 700; color: var(--ink1); }
.bp-action-desc { font-size: 12px; color: var(--ink3); }
.bp-progress { padding: 12px 16px; font-size: 13px; color: var(--ink2); display: flex; align-items: center; gap: 8px; }
.bp-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--olive); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.bp-error { padding: 8px 16px; font-size: 12px; color: #e53935; }
.bp-suggestions { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 16px; }
.bp-sug-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: 700; color: var(--ink1); }
.bp-sug-all { border: none; background: none; color: var(--olive); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.bp-sug-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.bp-sug-item { display: flex; gap: 8px; padding: 10px; border-radius: 8px; border: 1px solid var(--line); cursor: pointer; }
.bp-sug-item:hover { background: var(--surface-alt); }
.bp-sug-content { flex: 1; min-width: 0; }
.bp-sug-meta { display: flex; gap: 6px; margin-bottom: 4px; }
.bp-sug-skill { font-size: 11px; font-weight: 600; color: var(--olive); background: rgba(107,142,35,.1); padding: 1px 6px; border-radius: 4px; }
.bp-sug-type { font-size: 10px; color: var(--ink3); background: var(--surface); padding: 1px 6px; border-radius: 4px; }
.bp-sug-text { font-size: 12px; color: var(--ink1); line-height: 1.5; }
.bp-sug-reason { font-size: 11px; color: var(--ink3); margin-top: 2px; }
.bp-apply-btn {
  margin-top: 12px; padding: 10px; border-radius: 8px; border: none;
  background: var(--olive); color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: inherit;
}
.bp-apply-btn:disabled { opacity: .4; cursor: not-allowed; }
</style>
