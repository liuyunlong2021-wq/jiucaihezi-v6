<script setup lang="ts">
/**
 * AgentWizard.vue — 引导式搭子创建（colleague-skill 完全体）
 *
 * 使用 colleague-skill 的 intake → analysis → generation 管线：
 *   Step 1: 有没有参考资料/标准答案 → 分析 → 生成 SKILL.md 草稿
 *   Step 1 备选（无资料）: 想让搭子做什么 + 输出规范
 *   Step 2: 填触发关键词
 *   Step 3: 起名字 → 保存
 *
 * @see https://github.com/titanwings/colleague-skill
 */
import { ref, computed } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { resolveApiConfig, buildHeaders } from '@/utils/api'
import type { SkillConfig } from '@/types/skill'
import { parseSkillMd } from '@/types/skill'

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAgentStore()

// ─── Wizard state ───
const step = ref(1)
const hasReference = ref<null | boolean>(null) // null=未选, true=有资料, false=没资料
const referenceText = ref('')
const referenceUrl = ref('')
const githubUrl = ref('')
const purposeText = ref('')  // 想让搭子做什么
const outputFormat = ref('') // 输出规范
const triggers = ref('')
const skillName = ref('')
const isGenerating = ref(false)
const generatedSkillMd = ref('')
const errorMsg = ref('')

// Step 1 模式
const step1Mode = computed(() => {
  if (hasReference.value === null) return 'choose'
  return hasReference.value ? 'reference' : 'describe'
})

// ─── colleague-skill: intake prompt ───
// 参考 colleague-skill/prompts/intake.md
const intakeFromRefPrompt = `你是 colleague-skill 的 intake 引擎。用户提供了参考资料/标准答案。

## 你的任务（参考 colleague-skill 的 intake → persona_analyzer → work_builder 管线）
1. 仔细阅读用户提供的参考资料
2. 提取核心工作模式：这个搭子的主要职责是什么？
3. 提取输出规范：标准输出应该是什么样的？
4. 提取关键规则：哪些做法是必须遵循的？
5. 生成一份完整的 SKILL.md body

## 输出格式
直接输出 SKILL.md body（不含 frontmatter），包含以下部分：
- ## 角色定义
- ## 工作流程
- ## 输出格式
- ## 规则约束（从参考资料中提取的必须遵循的规则）
- ## 示例（从参考资料中提取的典型案例）
- ## 参考资料`

const intakeFromDescPrompt = `你是 colleague-skill 的 intake 引擎。用户描述了想让搭子做什么。

## 你的任务（参考 colleague-skill 的 intake → persona_analyzer → work_builder 管线）
1. 理解用户描述的用途
2. 理解用户期望的输出规范
3. 设计完整的工作流程
4. 生成一份完整的 SKILL.md body

## 输出格式
直接输出 SKILL.md body（不含 frontmatter），包含以下部分：
- ## 角色定义
- ## 工作流程
- ## 输出格式
- ## 规则约束
- ## 示例`

// ─── 生成 SKILL.md ───
async function generateSkillMd() {
  isGenerating.value = true
  errorMsg.value = ''

  try {
    const config = await resolveApiConfig()
    let sysPrompt = ''
    let userMsg = ''

    if (hasReference.value) {
      sysPrompt = intakeFromRefPrompt
      userMsg = `## 参考资料\n${referenceText.value}\n\n${referenceUrl.value ? '## 参考链接\n' + referenceUrl.value : ''}`
    } else {
      sysPrompt = intakeFromDescPrompt
      userMsg = `## 用途\n${purposeText.value}\n\n## 期望的输出规范\n${outputFormat.value}`
    }

    const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.4,
        max_tokens: 3000,
        stream: false,
      }),
    })

    if (!res.ok) throw new Error(`API 错误: ${res.status}`)

    const data = await res.json()
    generatedSkillMd.value = (data.choices?.[0]?.message?.content || '')
      .replace(/^```markdown\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    step.value = 2
  } catch (e: any) {
    errorMsg.value = e.message || '生成失败'
  } finally {
    isGenerating.value = false
  }
}

// ─── GitHub 导入 ───
async function importFromGitHub() {
  if (!githubUrl.value.trim()) return
  isGenerating.value = true
  errorMsg.value = ''

  try {
    // 转换 GitHub URL 为 raw URL
    let rawUrl = githubUrl.value.trim()
    if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
      rawUrl = rawUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
    }
    if (!rawUrl.endsWith('SKILL.md') && !rawUrl.endsWith('README.md')) {
      rawUrl = rawUrl.replace(/\/$/, '') + '/main/SKILL.md'
    }

    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error(`获取失败: ${res.status}`)

    const text = await res.text()
    const parsed = parseSkillMd(text)

    skillName.value = parsed.name || ''
    triggers.value = (parsed.triggers || []).join(', ')
    generatedSkillMd.value = parsed.skillContent || ''

    step.value = 3
  } catch (e: any) {
    errorMsg.value = `导入失败: ${e.message}`
  } finally {
    isGenerating.value = false
  }
}

// ─── 保存搭子 ───
function saveSkill() {
  if (!skillName.value.trim()) {
    errorMsg.value = '请给搭子起个名字'
    return
  }

  const skill: SkillConfig = {
    id: 'skill_' + Date.now().toString(36),
    name: skillName.value.trim(),
    description: generatedSkillMd.value.slice(0, 120),
    triggers: triggers.value.split(/[,，]/).map(t => t.trim()).filter(Boolean),
    skillContent: generatedSkillMd.value,
    references: referenceUrl.value ? [referenceUrl.value] : [],
    examples: [],
    version: 1,
    source: githubUrl.value ? 'github' : 'user',
    githubUrl: githubUrl.value || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    evolutionLog: [],
  }

  store.createAgent(skill)
  store.selectAgent(skill.id)
  emit('close')
}
</script>

<template>
  <div class="wizard-panel">
    <div class="wizard-head">
      <span class="mso">build_circle</span>
      <span>创建搭子</span>
    </div>

    <!-- Progress bar -->
    <div class="wizard-progress">
      <div v-for="i in 3" :key="i" class="wizard-dot" :class="{ active: step >= i }">{{ i }}</div>
    </div>

    <!-- Step 1: 收集信息 -->
    <div v-if="step === 1" class="wizard-body">
      <!-- 先选模式 -->
      <div v-if="step1Mode === 'choose'" class="wizard-choose">
        <h3>你有没有参考资料或标准答案？</h3>
        <p class="wizard-hint">如果你有"正确的范文"，搭子能学会你想要的输出风格。</p>
        <div class="wizard-choice-row">
          <button class="wizard-choice" @click="hasReference = true">
            <span class="mso">description</span>
            <span>有，我来发给你</span>
          </button>
          <button class="wizard-choice" @click="hasReference = false">
            <span class="mso">edit_note</span>
            <span>没有，我来描述</span>
          </button>
        </div>

        <!-- GitHub 导入 -->
        <div class="wizard-github-section">
          <div class="wizard-divider"><span>或者</span></div>
          <div class="wizard-github-row">
            <input v-model="githubUrl" class="wizard-input" placeholder="粘贴 GitHub 仓库 URL（含 SKILL.md）" />
            <button class="wizard-btn-sm" :disabled="isGenerating" @click="importFromGitHub">
              {{ isGenerating ? '导入中...' : '导入' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 有参考资料 -->
      <div v-else-if="step1Mode === 'reference'" class="wizard-ref">
        <h3>发给我你的参考资料或标准答案</h3>
        <p class="wizard-hint">搭子会分析这些内容，学会你想要的输出规则和风格。</p>
        <textarea
          v-model="referenceText"
          class="wizard-textarea"
          rows="8"
          placeholder="粘贴参考资料/标准答案..."
        ></textarea>
        <input v-model="referenceUrl" class="wizard-input" placeholder="参考链接（可选）" />
        <div class="wizard-actions">
          <button class="wizard-btn-back" @click="hasReference = null">← 返回</button>
          <button class="wizard-btn-primary" :disabled="!referenceText.trim() || isGenerating" @click="generateSkillMd">
            {{ isGenerating ? '分析中...' : '分析并创建 →' }}
          </button>
        </div>
      </div>

      <!-- 没有参考资料 -->
      <div v-else class="wizard-desc">
        <h3>想让这个搭子帮你做什么？</h3>
        <p class="wizard-hint">用一句话描述，比如"帮我写小红书种草文案"。</p>
        <textarea v-model="purposeText" class="wizard-textarea" rows="3" placeholder="帮我做什么..."></textarea>

        <h3>输出什么样的内容算合格？</h3>
        <textarea v-model="outputFormat" class="wizard-textarea" rows="3" placeholder="比如：300-500字，口语化，带emoji..."></textarea>

        <div class="wizard-actions">
          <button class="wizard-btn-back" @click="hasReference = null">← 返回</button>
          <button class="wizard-btn-primary" :disabled="!purposeText.trim() || isGenerating" @click="generateSkillMd">
            {{ isGenerating ? '生成中...' : '生成搭子 →' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: 触发关键词 -->
    <div v-if="step === 2" class="wizard-body">
      <h3>什么时候自动叫它出来？</h3>
      <p class="wizard-hint">填几个关键词（逗号隔开），当你的消息包含这些词时，搭子会自动接手。</p>
      <input v-model="triggers" class="wizard-input" placeholder="比如：小红书, 种草, 文案" />
      <h3>搭子能力预览</h3>
      <div class="wizard-preview">{{ generatedSkillMd.slice(0, 500) }}...</div>
      <div class="wizard-actions">
        <button class="wizard-btn-back" @click="step = 1">← 返回</button>
        <button class="wizard-btn-primary" :disabled="!triggers.trim()" @click="step = 3">下一步 →</button>
      </div>
    </div>

    <!-- Step 3: 起名字 -->
    <div v-if="step === 3" class="wizard-body">
      <h3>给搭子起个名字</h3>
      <input v-model="skillName" class="wizard-input" placeholder="比如：小红书文案" />
      <div class="wizard-actions">
        <button class="wizard-btn-back" @click="step = 2">← 返回</button>
        <button class="wizard-btn-primary" :disabled="!skillName.trim()" @click="saveSkill">✅ 创建搭子</button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="errorMsg" class="wizard-error">{{ errorMsg }}</div>
  </div>
</template>

<style scoped>
.wizard-panel {
  height: 100%; display: flex; flex-direction: column;
  background: var(--surface); overflow-y: auto;
}
.wizard-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px;
  font-size: 16px; font-weight: 700; color: var(--ink1);
  border-bottom: 1px solid var(--line);
}
.wizard-head .mso { font-size: 22px; color: var(--olive); }
.wizard-progress {
  display: flex; justify-content: center; gap: 12px; padding: 16px;
}
.wizard-dot {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  background: var(--line); color: var(--ink3);
  transition: all .2s;
}
.wizard-dot.active {
  background: var(--olive); color: #fff;
}
.wizard-body { padding: 0 20px 20px; }
.wizard-body h3 {
  font-size: 15px; font-weight: 700; color: var(--ink1);
  margin: 16px 0 4px;
}
.wizard-hint {
  font-size: 13px; color: var(--ink3); margin: 0 0 12px;
}
.wizard-choose { text-align: center; }
.wizard-choice-row {
  display: flex; gap: 12px; margin: 20px 0;
}
.wizard-choice {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; gap: 8px;
  padding: 20px; border-radius: 12px;
  border: 2px solid var(--line);
  background: var(--paper); cursor: pointer;
  font-size: 14px; font-weight: 600; color: var(--ink1);
  transition: all .15s;
  font-family: inherit;
}
.wizard-choice:hover { border-color: var(--olive); background: var(--bg); }
.wizard-choice .mso { font-size: 32px; color: var(--olive); }
.wizard-github-section { margin-top: 16px; }
.wizard-divider {
  display: flex; align-items: center; gap: 12px;
  color: var(--ink3); font-size: 12px; margin: 12px 0;
}
.wizard-divider::before, .wizard-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--line);
}
.wizard-github-row { display: flex; gap: 8px; }
.wizard-input {
  flex: 1; padding: 10px 14px; border-radius: 8px;
  border: 1.5px solid var(--line); background: var(--bg);
  font-size: 14px; color: var(--ink1); font-family: inherit;
  outline: none;
}
.wizard-input:focus { border-color: var(--olive); }
.wizard-textarea {
  width: 100%; padding: 10px 14px; border-radius: 8px;
  border: 1.5px solid var(--line); background: var(--bg);
  font-size: 14px; color: var(--ink1); font-family: inherit;
  resize: vertical; outline: none;
  box-sizing: border-box;
}
.wizard-textarea:focus { border-color: var(--olive); }
.wizard-btn-sm {
  padding: 10px 18px; border-radius: 8px; border: none;
  background: var(--olive); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.wizard-btn-sm:disabled { opacity: .5; cursor: not-allowed; }
.wizard-actions {
  display: flex; gap: 12px; margin-top: 20px; justify-content: flex-end;
}
.wizard-btn-back {
  padding: 10px 18px; border-radius: 8px;
  border: 1.5px solid var(--line); background: var(--paper);
  color: var(--ink2); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.wizard-btn-primary {
  padding: 10px 24px; border-radius: 8px; border: none;
  background: var(--olive); color: #fff;
  font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.wizard-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.wizard-preview {
  padding: 12px; border-radius: 8px;
  background: var(--bg); border: 1px solid var(--line);
  font-size: 12px; color: var(--ink2);
  white-space: pre-wrap; max-height: 200px; overflow-y: auto;
  font-family: monospace;
}
.wizard-model-hint {
  margin-top: 16px; padding: 12px; border-radius: 8px;
  background: var(--bg); font-size: 13px; color: var(--ink2);
}
.wizard-error {
  margin: 12px 20px 20px;
  padding: 10px 14px; border-radius: 8px;
  background: #fff0f0; color: #c00; font-size: 13px;
}
</style>
