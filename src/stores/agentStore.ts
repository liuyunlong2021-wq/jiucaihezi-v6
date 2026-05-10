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
    skillContent: `## 角色定义\n你是「新手指导」— 韭菜盒子 AI 工作站的专属向导搭子。\n\n## 工作流程\n1. 识别用户的困惑点\n2. 用最简单直白的语言解释功能\n3. 给出具体操作步骤\n4. 确认用户是否理解\n\n## 输出格式\n- 用数字编号列出步骤\n- 每步不超过一句话\n- 关键按钮用【】标注`,
    references: [], examples: ['欢迎来到韭菜盒子！有任何问题随时问我。'],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'manhua', name: '漫剧剧本',
    description: '当用户想创作漫剧、短剧、分镜剧本时自动激活。从灵感碎片生成完整剧本。',
    triggers: ['漫剧', '剧本', '分镜', '短剧', '故事'],
    skillContent: `## 角色定义\n你是「漫剧剧本」创作搭子，擅长将灵感碎片转化为结构化的漫剧剧本。\n\n## 工作流程\n1. 收集用户灵感\n2. 提炼核心冲突和情感线\n3. 生成分镜大纲\n4. 迭代优化\n\n## 输出格式\n- 标题行\n- 每个分镜编号 + 画面 + 台词 + 镜头\n- 情绪标注`,
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'ppt_designer', name: 'PPT 设计师',
    description: '当用户需要制作PPT、设计演示文稿内容和素材时自动激活。',
    triggers: ['PPT', 'ppt', '演示', '幻灯片', '汇报'],
    skillContent: `## 角色定义\n你是「PPT 设计师」，负责PPT内容设计和素材设计。\n\n## 工作流程\n1. 了解主题和用途\n2. 设计内容大纲\n3. 建议配色和版式\n4. 逐页输出内容\n\n## 输出格式\n- 每页标题 + 3-5个要点\n- 配图建议\n- 演讲备注`,
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'write_000', name: '写作',
    description: '当用户需要写文章、小说、文案等文字创作时自动激活。',
    triggers: ['写作', '文章', '小说', '文案', '写'],
    skillContent: `## 角色定义\n你是「写作总管」，小说与文字创作流水线的总调度。\n\n## 工作流程\n1. 了解写作类型和目标读者\n2. 确定风格、调性、篇幅\n3. 生成大纲或直接创作\n4. 迭代修改`,
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },

  // ═══ 以下 17 个 Skill 来自 /skills/ 目录 ═══

  {
    id: 'film-type-analysis', name: '影片风格分析师',
    description: '分析剧本确定视觉风格、画面比例与叙事节奏',
    triggers: ['风格', '分析', '类型', '比例', '节奏'],
    skillContent: 'skill://skills/film-type-analysis/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'film-character-asset', name: '角色设定师',
    description: '从剧本提取角色资产控制表与制作手册',
    triggers: ['角色', '人设', '立绘', '角色表'],
    skillContent: 'skill://skills/film-character-asset/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'film-scene-asset', name: '场景设定师',
    description: '设计可复用的空镜主场景资产规格',
    triggers: ['场景', '空镜', '环境', '背景'],
    skillContent: 'skill://skills/film-scene-asset/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'film-prop-asset', name: '道具设定师',
    description: '拆解剧本道具为精确可生图的资产规格',
    triggers: ['道具', '物件', '细节', '物品'],
    skillContent: 'skill://skills/film-prop-asset/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'film-engineering-book', name: '素材工程师',
    description: '将剧本转化为镜头级可复用素材单元',
    triggers: ['工程', '拆解', '素材', '工程书'],
    skillContent: 'skill://skills/film-engineering-book/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'film-shot-design', name: '分镜设计师',
    description: '将工程素材编排成可执行的分镜表',
    triggers: ['分镜', '镜头', '运镜', '分镜表'],
    skillContent: 'skill://skills/film-shot-design/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'banana-character-prompt', name: '角色提示词生成',
    description: '将角色设定转为 Banana 生图 JSON 提示词',
    triggers: ['Banana', '角色提示词', '角色生图'],
    skillContent: 'skill://skills/banana-character-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'banana-scene-prompt', name: '场景提示词生成',
    description: '将场景设定转为 Banana 生图提示词',
    triggers: ['场景提示词', '场景生图', 'Banana场景'],
    skillContent: 'skill://skills/banana-scene-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'banana-prop-prompt', name: '道具提示词生成',
    description: '将道具设定转为 Banana 生图提示词',
    triggers: ['道具提示词', '道具生图', 'Banana道具'],
    skillContent: 'skill://skills/banana-prop-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'banana-grid-shot-prompt', name: '分镜板提示词',
    description: '将分镜转为 3×3 格子分镜板提示词',
    triggers: ['分镜板', '3x3', 'grid', '网格分镜'],
    skillContent: 'skill://skills/banana-grid-shot-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'banana-storyboard-edit-prompt', name: '分镜修图提示词',
    description: '针对单帧分镜板的精修编辑提示词',
    triggers: ['修图', '分镜修复', '编辑分镜', '精修'],
    skillContent: 'skill://skills/banana-storyboard-edit-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'grok-video-prompt', name: 'Grok 视频提示词',
    description: '将分镜转为 Grok 视频时间线格式',
    triggers: ['Grok', 'Grok视频', '视频提示词'],
    skillContent: 'skill://skills/grok-video-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'veo-video-prompt', name: 'Veo 视频提示词',
    description: '将分镜转为 Veo 兼容生视频提示词',
    triggers: ['Veo', 'Veo视频', '视频生成'],
    skillContent: 'skill://skills/veo-video-prompt/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'ltx-video-action', name: 'LTX 视频提示词',
    description: '将分镜转为 LTX 2.3 图生视频提示词',
    triggers: ['LTX', '动作视频', 'LTX视频'],
    skillContent: 'skill://skills/ltx-video-action/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'video-composer', name: '视频合成工具',
    description: '拼接视频片段并添加字幕',
    triggers: ['合成', '拼接', '字幕', '剪辑'],
    skillContent: 'skill://skills/video-composer/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'voice-bound-shot-video', name: '配音绑定镜头',
    description: '用音频驱动单镜头对白视频生成',
    triggers: ['配音', '对白', '声音镜头', '音频驱动'],
    skillContent: 'skill://skills/voice-bound-shot-video/SKILL.md',
    references: [], examples: [],
    version: 1, source: 'preset', createdAt: 0, updatedAt: 0, evolutionLog: [],
  },
  {
    id: 'qwen-tts-voice-design', name: '声音设计师',
    description: '为角色设计 Qwen TTS 语音提示词',
    triggers: ['TTS', '声音', '语音', '配音设计'],
    skillContent: 'skill://skills/qwen-tts-voice-design/SKILL.md',
    references: [], examples: [],
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
