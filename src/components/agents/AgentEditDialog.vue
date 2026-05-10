<script setup lang="ts">
/**
 * AgentEditDialog — 创建/编辑搭子对话框
 * 源自 code.html:
 *   - #modal-agent-edit (行 1907-1917)
 *   - saveAgentEdit() (行 12420-12435)
 *   - openAgentEdit() / closeAgentEdit()
 */
import { ref, watch } from 'vue'
import { useAgentStore, type Agent } from '@/stores/agentStore'

const agentStore = useAgentStore()

const props = defineProps<{
  visible: boolean
  editAgent?: Agent | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const name = ref('')
const icon = ref('smart_toy')
const systemPrompt = ref('')

// 编辑模式时填充
watch(() => props.editAgent, (agent) => {
  if (agent) {
    name.value = agent.name
    icon.value = agent.icon || 'smart_toy'
    systemPrompt.value = agent.systemPrompt || ''
  } else {
    name.value = ''
    icon.value = 'smart_toy'
    systemPrompt.value = ''
  }
}, { immediate: true })

// 保存 — 参考 code.html saveAgentEdit() 行 12420-12435
function save() {
  const n = name.value.trim()
  if (!n) return

  if (props.editAgent) {
    // 编辑已有搭子
    const custom = agentStore.getCustomAgents()
    const ag = custom.find(c => c.id === props.editAgent!.id)
    if (ag) {
      ag.name = n
      ag.icon = icon.value.trim() || 'smart_toy'
      ag.systemPrompt = systemPrompt.value
      agentStore.saveCustomAgents(agentStore.PRESETS.concat(custom))
    }
  } else {
    // 新建搭子
    const newAgent: Agent = {
      id: 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: n,
      icon: icon.value.trim() || 'smart_toy',
      systemPrompt: systemPrompt.value,
      folder: '我的搭子',
      source: 'user',
    }
    agentStore.createAgent(newAgent)
  }
  emit('close')
}

// 预览图标列表
const commonIcons = [
  'smart_toy', 'draw', 'auto_stories', 'movie', 'palette', 
  'psychology', 'auto_awesome', 'code', 'music_note', 'image',
  'translate', 'school', 'science', 'analytics', 'terminal',
]
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ae-overlay" @mousedown.self="emit('close')">
      <div class="ae-box">
        <h2 class="serif">{{ editAgent ? '编辑搭子' : '创建搭子' }}</h2>

        <!-- 名称 — 行 1910 -->
        <div class="ae-field">
          <label>名称</label>
          <input v-model="name" type="text" placeholder="搭子名称" />
        </div>

        <!-- 图标 — 行 1911 -->
        <div class="ae-field">
          <label>图标</label>
          <div class="ae-icon-row">
            <input v-model="icon" type="text" placeholder="smart_toy" class="ae-icon-input" />
            <span class="mso ae-preview">{{ icon || 'smart_toy' }}</span>
          </div>
          <div class="ae-icon-grid">
            <button
              v-for="ic in commonIcons"
              :key="ic"
              class="ae-icon-chip"
              :class="{ active: icon === ic }"
              @click="icon = ic"
            >
              <span class="mso">{{ ic }}</span>
            </button>
          </div>
        </div>

        <!-- System Prompt -->
        <div class="ae-field">
          <label>系统提示词</label>
          <textarea
            v-model="systemPrompt"
            placeholder="告诉搭子它是什么角色、有什么技能..."
            rows="5"
          />
        </div>

        <!-- Actions — 行 1912-1915 -->
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
