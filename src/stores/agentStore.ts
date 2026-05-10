/**
 * stores/agentStore.ts — 搭子管理 Store
 * 源自 code.html:
 *   - PRESETS (行 3058-4046)
 *   - loadAgents() (行 4208-4211)
 *   - saveCustomAgents() (行 4212-4225)
 *   - getCustomAgents() (行 4226-4231)
 *   - selectAgent() (行 4741-4807) 简化版
 *   - PILL_MODELS (行 2754)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ─── 搭子类型 ───
export interface Agent {
  id: string
  name: string
  icon: string
  folder?: string
  systemPrompt: string
  openingMessage?: string
  specialMode?: string
  source?: string
  nextAgent?: string
}

// ─── PILL_MODELS — 精确复制自 code.html 行 2754 ───
export const PILL_MODELS = [
  { id: 'claude-opus-4-7', label: 'Opus-4.7' },
  { id: 'claude-opus-4-6', label: 'Opus' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'qwen3.6-plus', label: 'Qwen-3.6' },
  { id: 'deepseek-v4-flash', label: 'DS-V4-Flash' },
  { id: 'deepseek-v4-pro', label: 'DS-V4-Pro' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma-31B' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'G-Flash-Lite' },
  { id: 'gemini-3.1-pro-preview', label: 'G-3.1-Pro' },
]

// ─── PRESETS — 精简版（只保留 folder !== '_hidden' 的可见搭子）───
// 完整 systemPrompt 太长（~900行），这里只保留ID/名称/图标/开场白
// 完整提示词后续从 code.html 逐个精确复制
const PRESETS: Agent[] = [
  {
    id: 'guide', name: '新手指导', icon: 'help', folder: '_top',
    systemPrompt: '你是「新手指导」— 韭菜盒子 AI 工作站的专属向导搭子。帮助新用户快速上手韭菜盒子的所有功能。',
    openingMessage: '欢迎来到韭菜盒子！有任何问题随时问我。',
  },
  {
    id: 'manhua', name: '漫剧剧本', icon: 'auto_stories', folder: '_top',
    specialMode: 'manhua',
    systemPrompt: '',
    openingMessage: '**「漫剧剧本」创作空间** 已就绪 ✨\n\n把你脑海里的灵感碎片告诉我——一个角色、一个场景、一句话、甚至一个模糊的感觉都行。',
  },
  {
    id: 'make_000', name: '漫剧提示词', icon: 'movie', folder: '_top',
    systemPrompt: '你是「制作总监」，AI 短剧制作流水线的总调度与面对用户的唯一总客服。',
  },
  {
    id: 'ppt_designer', name: 'PPT 设计师', icon: 'view_carousel', folder: '_top',
    systemPrompt: '你是「PPT 设计师」，韭菜盒子里专门负责 PPT 内容设计和素材设计的文字搭子。',
  },
  {
    id: 'write_000', name: '写作', icon: 'draw', folder: '_top',
    systemPrompt: '你是「写作总管」，小说与文字创作流水线的总调度与面对用户的唯一总客服。',
  },
]

export const useAgentStore = defineStore('agents', () => {
  const currentAgent = ref<Agent | null>(null)
  const currentModel = ref(localStorage.getItem('jcModel') || 'claude-sonnet-4-6')

  // ─── loadAgents — 行 4208-4211 ───
  function loadAgents(): Agent[] {
    let custom: Agent[] = []
    try {
      custom = JSON.parse(localStorage.getItem('jc_agents_v1') || '[]') || []
    } catch { custom = [] }
    return PRESETS.concat(custom)
  }

  // ─── getCustomAgents — 行 4226-4231 ───
  function getCustomAgents(): Agent[] {
    try {
      const presetIds = PRESETS.map(p => p.id)
      return (JSON.parse(localStorage.getItem('jc_agents_v1') || '[]') || [])
        .filter((agent: Agent) => agent && presetIds.indexOf(agent.id) === -1)
    } catch { return [] }
  }

  // ─── saveCustomAgents — 行 4212-4225 ───
  function saveCustomAgents(list: Agent[]) {
    const presetIds = PRESETS.map(p => p.id)
    const safe = (Array.isArray(list) ? list : [])
      .filter(agent => agent && presetIds.indexOf(agent.id) === -1)
      .map(agent => ({ ...agent, source: 'user' }))
    localStorage.setItem('jc_agents_v1', JSON.stringify(safe))
    localStorage.setItem('jc_agents', JSON.stringify(PRESETS.concat(safe)))
  }

  // ─── visibleAgents (非 _hidden) ───
  const agents = computed(() => {
    return loadAgents().filter(a => a.folder !== '_hidden')
  })

  // ─── selectAgent — 简化自行 4741-4807 ───
  function selectAgent(id: string | null) {
    if (!id) {
      currentAgent.value = null
      localStorage.removeItem('jc_last_agent_id')
      return
    }
    // Toggle: 再次点击取消选择 (行 4266-4270)
    if (currentAgent.value?.id === id) {
      currentAgent.value = null
      localStorage.removeItem('jc_last_agent_id')
      return
    }
    const found = loadAgents().find(a => a.id === id) || null
    currentAgent.value = found
    if (found) {
      localStorage.setItem('jc_last_agent_id', found.id)
    }
  }

  // ─── setModel — 行 2784 setModelFromMenu ───
  function setModel(modelId: string) {
    currentModel.value = modelId
    localStorage.setItem('jcModel', modelId)
  }

  // ─── getModelLabel — 行 2755-2758 ───
  const modelLabel = computed(() => {
    const f = PILL_MODELS.find(x => x.id === currentModel.value)
    return f ? f.label : currentModel.value.split('-')[0]
  })

  // ─── 恢复上次选中的搭子 ───
  function restoreLastAgent() {
    const lastId = localStorage.getItem('jc_last_agent_id')
    if (lastId) {
      const found = loadAgents().find(a => a.id === lastId)
      if (found) currentAgent.value = found
    }
  }

  // ─── 创建自定义搭子 ───
  function createAgent(agent: Agent) {
    const all = loadAgents()
    all.push(agent)
    saveCustomAgents(all)
  }

  // ─── 删除自定义搭子 ───
  function deleteAgent(id: string) {
    const presetIds = PRESETS.map(p => p.id)
    if (presetIds.includes(id)) return // 不能删预设
    const custom = getCustomAgents().filter(a => a.id !== id)
    saveCustomAgents(PRESETS.concat(custom))
    if (currentAgent.value?.id === id) {
      currentAgent.value = null
    }
  }

  return {
    currentAgent,
    currentModel,
    agents,
    modelLabel,
    loadAgents,
    getCustomAgents,
    saveCustomAgents,
    selectAgent,
    setModel,
    restoreLastAgent,
    createAgent,
    deleteAgent,
    PRESETS,
  }
})
