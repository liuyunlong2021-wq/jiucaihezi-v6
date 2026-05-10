/**
 * stores/agentStore.ts — 搭子管理 Store（SKILL.md 标准格式）
 *
 * 对齐标准：
 *   - superpowers SKILL.md frontmatter (name, description, triggers)
 *   - colleague-skill .skill 格式
 *   - PILL_MODELS (行 2754)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SkillConfig } from '../types/skill'
import { migrateAgentToSkill } from '../types/skill'

// ─── 向后兼容：旧 Agent 类型（迁移用） ───
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

// ─── PRESETS — 全部改为 SKILL.md 标准格式 ───
const SKILL_PRESETS: SkillConfig[] = [
  {
    id: 'guide', name: '新手指导',
    description: '当用户初次使用韭菜盒子，或对功能有疑问时自动激活。引导新用户快速上手所有功能。',
    triggers: ['怎么用', '帮助', '教程', '不会', '新手'],
    skillContent: `## 角色定义
你是「新手指导」— 韭菜盒子 AI 工作站的专属向导搭子。

## 工作流程
1. 识别用户的困惑点
2. 用最简单直白的语言解释功能
3. 给出具体操作步骤（第一步、第二步……）
4. 确认用户是否理解

## 输出格式
- 用数字编号列出步骤
- 每步不超过一句话
- 关键按钮用【】标注

## 示例
用户：怎么创建搭子？
回答：
1. 点击左侧【搭子】图标
2. 点击【+ 创建搭子】按钮
3. 按照引导填写信息
4. 点击【保存】完成`,
    references: [],
    examples: ['欢迎来到韭菜盒子！有任何问题随时问我。'],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'manhua', name: '漫剧剧本',
    description: '当用户想创作漫剧、短剧、分镜剧本时自动激活。从灵感碎片生成完整剧本。',
    triggers: ['漫剧', '剧本', '分镜', '短剧', '故事'],
    skillContent: `## 角色定义
你是「漫剧剧本」创作搭子，擅长将灵感碎片转化为结构化的漫剧剧本。

## 工作流程
1. 收集用户灵感（角色/场景/情绪/一句话都行）
2. 提炼核心冲突和情感线
3. 生成分镜大纲（每个分镜含：画面描述 + 台词 + 镜头指示）
4. 迭代优化

## 输出格式
- 标题行
- 每个分镜编号 + 画面 + 台词 + 镜头
- 情绪标注

## 参考资料
- 短剧平台内容规范
- 分镜脚本标准格式`,
    references: [],
    examples: ['**「漫剧剧本」创作空间** 已就绪 ✨\n\n把你脑海里的灵感碎片告诉我——一个角色、一个场景、一句话、甚至一个模糊的感觉都行。'],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'make_000', name: '漫剧提示词',
    description: '当用户需要生成短剧制作的提示词、素材指令时自动激活。AI短剧制作流水线的总调度。',
    triggers: ['提示词', '制作', '素材', '指令'],
    skillContent: `## 角色定义
你是「制作总监」，AI 短剧制作流水线的总调度与面对用户的唯一总客服。

## 工作流程
1. 理解用户的制作需求
2. 分解为具体的提示词指令
3. 按照制作流程排序输出
4. 提供调参建议

## 输出格式
- 每条提示词独立编号
- 标注用途（文生图/图生图/生视频）
- 附带参数建议`,
    references: [],
    examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'ppt_designer', name: 'PPT 设计师',
    description: '当用户需要制作PPT、设计演示文稿内容和素材时自动激活。',
    triggers: ['PPT', 'ppt', '演示', '幻灯片', '汇报'],
    skillContent: `## 角色定义
你是「PPT 设计师」，韭菜盒子里专门负责 PPT 内容设计和素材设计的搭子。

## 工作流程
1. 了解PPT主题和用途
2. 设计内容大纲（每页标题+要点）
3. 建议配色和版式方案
4. 逐页输出内容

## 输出格式
- 每页标题 + 3-5个要点
- 配图建议
- 演讲备注`,
    references: [],
    examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'write_000', name: '写作',
    description: '当用户需要写文章、小说、文案等文字创作时自动激活。',
    triggers: ['写作', '文章', '小说', '文案', '写'],
    skillContent: `## 角色定义
你是「写作总管」，小说与文字创作流水线的总调度。

## 工作流程
1. 了解写作类型和目标读者
2. 确定风格、调性、篇幅
3. 生成大纲或直接创作
4. 迭代修改

## 输出格式
- 根据体裁自动调整格式
- 小说类分章节
- 文案类含标题+正文+标签`,
    references: [],
    examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
]

export const useAgentStore = defineStore('agents', () => {
  const currentAgent = ref<SkillConfig | null>(null)
  const currentModel = ref(localStorage.getItem('jcModel') || 'claude-sonnet-4-6')
  const routerEnabled = ref(localStorage.getItem('jc_router_enabled') !== '0')

  // ─── 迁移旧数据 ───
  function migrateOldAgents(): SkillConfig[] {
    try {
      const raw = localStorage.getItem('jc_agents_v1')
      if (!raw) return []
      const old = JSON.parse(raw) as Agent[]
      return old.map(a => migrateAgentToSkill(a))
    } catch { return [] }
  }

  // ─── loadSkills ───
  function loadSkills(): SkillConfig[] {
    let custom: SkillConfig[] = []
    try {
      const raw = localStorage.getItem('jc_skills_v2')
      if (raw) {
        custom = JSON.parse(raw) || []
      } else {
        // 尝试迁移 v1 数据
        custom = migrateOldAgents()
        if (custom.length > 0) {
          localStorage.setItem('jc_skills_v2', JSON.stringify(custom))
        }
      }
    } catch { custom = [] }
    return SKILL_PRESETS.concat(custom)
  }

  // ─── getCustomSkills ───
  function getCustomSkills(): SkillConfig[] {
    const presetIds = SKILL_PRESETS.map(p => p.id)
    return loadSkills().filter(s => !presetIds.includes(s.id))
  }

  // ─── saveCustomSkills ───
  function saveCustomSkills(list: SkillConfig[]) {
    const presetIds = SKILL_PRESETS.map(p => p.id)
    const safe = list.filter(s => !presetIds.includes(s.id))
    localStorage.setItem('jc_skills_v2', JSON.stringify(safe))
  }

  // ─── 向后兼容 loadAgents / getCustomAgents / saveCustomAgents ───
  function loadAgents(): SkillConfig[] { return loadSkills() }
  function getCustomAgents(): SkillConfig[] { return getCustomSkills() }
  function saveCustomAgents(list: SkillConfig[]) { saveCustomSkills(list) }

  const agents = computed(() => loadSkills())

  function selectAgent(id: string | null) {
    if (!id) {
      currentAgent.value = null
      localStorage.removeItem('jc_last_agent_id')
      return
    }
    if (currentAgent.value?.id === id) {
      currentAgent.value = null
      localStorage.removeItem('jc_last_agent_id')
      return
    }
    const found = loadSkills().find(s => s.id === id) || null
    currentAgent.value = found
    if (found) localStorage.setItem('jc_last_agent_id', found.id)
  }

  function setModel(modelId: string) {
    currentModel.value = modelId
    localStorage.setItem('jcModel', modelId)
  }

  const modelLabel = computed(() => {
    const f = PILL_MODELS.find(x => x.id === currentModel.value)
    return f ? f.label : currentModel.value.split('-')[0]
  })

  function restoreLastAgent() {
    const lastId = localStorage.getItem('jc_last_agent_id')
    if (lastId) {
      const found = loadSkills().find(s => s.id === lastId)
      if (found) currentAgent.value = found
    }
  }

  function createAgent(skill: SkillConfig) {
    const custom = getCustomSkills()
    custom.push(skill)
    saveCustomSkills(custom)
  }

  function updateSkill(id: string, patch: Partial<SkillConfig>) {
    const all = loadSkills()
    const idx = all.findIndex(s => s.id === id)
    if (idx === -1) return
    Object.assign(all[idx], patch, { updatedAt: Date.now() })
    saveCustomSkills(all.filter(s => !SKILL_PRESETS.map(p => p.id).includes(s.id)))
  }

  function deleteAgent(id: string) {
    if (SKILL_PRESETS.some(p => p.id === id)) return
    const custom = getCustomSkills().filter(s => s.id !== id)
    saveCustomSkills(custom)
    if (currentAgent.value?.id === id) currentAgent.value = null
  }

  function toggleRouter(enabled?: boolean) {
    routerEnabled.value = enabled !== undefined ? enabled : !routerEnabled.value
    localStorage.setItem('jc_router_enabled', routerEnabled.value ? '1' : '0')
  }

  return {
    currentAgent,
    currentModel,
    routerEnabled,
    agents,
    modelLabel,
    loadAgents,
    loadSkills,
    getCustomAgents,
    getCustomSkills,
    saveCustomAgents,
    saveCustomSkills,
    selectAgent,
    setModel,
    restoreLastAgent,
    createAgent,
    updateSkill,
    deleteAgent,
    toggleRouter,
    PRESETS: SKILL_PRESETS,
  }
})
