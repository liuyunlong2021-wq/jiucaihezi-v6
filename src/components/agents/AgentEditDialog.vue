<script setup lang="ts">
/**
 * AgentEditDialog — 编辑搭子对话框（SKILL.md 标准格式）
 */
import { ref, watch } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import type { SkillConfig } from '@/types/skill'

const agentStore = useAgentStore()

const props = defineProps<{
  visible: boolean
  editAgent?: SkillConfig | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const name = ref('')
const description = ref('')
const triggers = ref('')
const skillContent = ref('')

watch(() => props.editAgent, (agent) => {
  if (agent) {
    name.value = agent.name
    description.value = agent.description || ''
    triggers.value = (agent.triggers || []).join(', ')
    skillContent.value = agent.skillContent || ''
  } else {
    name.value = ''
    description.value = ''
    triggers.value = ''
    skillContent.value = ''
  }
}, { immediate: true })

function save() {
  const n = name.value.trim()
  if (!n) return

  const triggerArr = triggers.value.split(/[,，]/).map(t => t.trim()).filter(Boolean)

  if (props.editAgent) {
    agentStore.updateSkill(props.editAgent.id, {
      name: n,
      description: description.value,
      triggers: triggerArr,
      skillContent: skillContent.value,
    })
  } else {
    const newSkill: SkillConfig = {
      id: 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: n,
      description: description.value,
      triggers: triggerArr,
      skillContent: skillContent.value,
      references: [],
      examples: [],
      version: 1,
      source: 'user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      evolutionLog: [],
    }
    agentStore.createAgent(newSkill)
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ae-overlay" @mousedown.self="emit('close')">
      <div class="ae-box">
        <h2 class="serif">{{ editAgent ? '编辑搭子' : '创建搭子' }}</h2>

        <!-- 名称 -->
        <div class="ae-field">
          <label>名称</label>
          <input v-model="name" type="text" placeholder="搭子名称" />
        </div>

        <!-- 描述 -->
        <div class="ae-field">
          <label>描述（什么时候激活 + 职责）</label>
          <input v-model="description" type="text" placeholder="当用户需要..." />
        </div>

        <!-- 触发词 -->
        <div class="ae-field">
          <label>触发关键词（逗号隔开）</label>
          <input v-model="triggers" type="text" placeholder="小红书, 种草, 文案" />
        </div>

        <!-- SKILL.md 内容 -->
        <div class="ae-field">
          <label>SKILL.md 内容</label>
          <textarea
            v-model="skillContent"
            placeholder="## 角色定义
…
## 工作流程
…
## 输出格式
…"
            rows="8"
          ></textarea>
        </div>

        <div class="ae-actions">
          <button class="ae-btn ae-ghost" @click="emit('close')">取消</button>
          <button class="ae-btn ae-primary" @click="save" :disabled="!name.trim()">
            {{ editAgent ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ae-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.ae-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  max-width: 420px;
  width: 92%;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
}
.ae-box h2 {
  font-size: 18px;
  color: var(--ink);
  margin: 0 0 20px;
}
.ae-field {
  margin-bottom: 16px;
}
.ae-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink2);
  margin-bottom: 6px;
}
.ae-field input,
.ae-field textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-alt);
  font-size: 13px;
  font-family: inherit;
  color: var(--ink);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.ae-field input:focus,
.ae-field textarea:focus {
  border-color: var(--olive);
}
.ae-field textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.6;
}
.ae-icon-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ae-icon-input { flex: 1; }
.ae-preview {
  font-size: 26px;
  color: var(--olive);
  width: 40px;
  text-align: center;
}
.ae-icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.ae-icon-chip {
  width: 32px; height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-alt);
  color: var(--ink3);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.ae-icon-chip .mso { font-size: 18px; }
.ae-icon-chip:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.ae-icon-chip.active {
  background: rgba(213, 199, 135, 0.18);
  border-color: var(--olive);
  color: var(--olive-dark);
}
.ae-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
.ae-btn {
  padding: 9px 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}
.ae-ghost {
  border: 1px solid var(--border);
  background: none;
  color: var(--ink2);
}
.ae-ghost:hover {
  background: var(--olive-pale);
}
.ae-primary {
  border: none;
  background: var(--olive);
  color: #fff;
}
.ae-primary:hover { transform: scale(1.03); }
.ae-primary:disabled { opacity: 0.4; cursor: default; transform: none; }
</style>
