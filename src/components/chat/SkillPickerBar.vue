<script setup lang="ts">
/**
 * SkillPickerBar.vue — 搭子快捷按钮栏（按钮映射，非命令）
 *
 * 用户要求：所有复杂指令 → 可视化按钮
 * 替代 OpenClaw 的 SlashCommandPanel
 *
 * 功能：
 *   1. 水平按钮栏展示已启用搭子
 *   2. 一键切换当前搭子
 *   3. 搜索过滤
 */
import { ref, computed } from 'vue'
import { useAgentStore } from '@/stores/agentStore'

const agentStore = useAgentStore()

const showPicker = ref(false)
const searchText = ref('')

const filteredAgents = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  const agents = agentStore.agents || []
  if (!q) return agents
  return agents.filter(a =>
    (a.name || '').toLowerCase().includes(q) ||
    (a.description || '').toLowerCase().includes(q) ||
    (a.triggers || []).some((t: string) => t.toLowerCase().includes(q))
  )
})

function selectAgent(id: string) {
  agentStore.selectAgent(id)
  showPicker.value = false
  searchText.value = ''
}

function clearAgent() {
  agentStore.selectAgent('')
  showPicker.value = false
}
</script>

<template>
  <!-- 快捷按钮 -->
  <div class="skill-bar">
    <button class="sb-toggle" :class="{ active: showPicker }" @click="showPicker = !showPicker">
      <span class="mso">apps</span>
      <span>搭子</span>
    </button>

    <!-- 当前激活的搭子 badge -->
    <div v-if="agentStore.currentAgent" class="sb-active" @click="showPicker = !showPicker">
      <span class="mso" style="font-size:14px">{{ agentStore.currentAgent.icon || 'smart_toy' }}</span>
      <span class="sb-name">{{ agentStore.currentAgent.name }}</span>
      <span class="mso sb-clear" @click.stop="clearAgent">close</span>
    </div>
  </div>

  <!-- 展开面板 -->
  <div v-if="showPicker" class="skill-panel">
    <input
      v-model="searchText"
      class="sp-search"
      placeholder="搜索搭子..."
      autofocus
    />
    <div class="sp-grid">
      <button
        v-for="agent in filteredAgents"
        :key="agent.id"
        class="sp-card"
        :class="{ selected: agentStore.currentAgent?.id === agent.id }"
        @click="selectAgent(agent.id)"
      >
        <span class="mso sp-icon">{{ agent.icon || 'smart_toy' }}</span>
        <div class="sp-info">
          <div class="sp-name">{{ agent.name }}</div>
          <div v-if="agent.description" class="sp-desc">{{ agent.description }}</div>
        </div>
      </button>
      <div v-if="filteredAgents.length === 0" class="sp-empty">没有找到搭子</div>
    </div>
  </div>
</template>

<style scoped>
.skill-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 4px;
}
.sb-toggle {
  display: flex; align-items: center; gap: 3px;
  padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--paper); color: var(--ink2); cursor: pointer;
  font-size: 12px; font-weight: 600; font-family: inherit;
  transition: all .12s;
}
.sb-toggle:hover, .sb-toggle.active { border-color: var(--olive); color: var(--olive); }
.sb-toggle .mso { font-size: 16px; }
.sb-active {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 6px;
  background: rgba(107,142,35,.1); color: var(--olive);
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.sb-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-clear { font-size: 14px; color: var(--ink3); cursor: pointer; }
.sb-clear:hover { color: #e53935; }

.skill-panel {
  padding: 8px 12px; border-top: 1px solid var(--line);
  background: var(--paper);
  animation: slide-down .15s ease;
}
@keyframes slide-down { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
.sp-search {
  width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--surface); color: var(--ink1); font-size: 12px; font-family: inherit;
  outline: none; margin-bottom: 8px;
}
.sp-search:focus { border-color: var(--olive); }
.sp-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px; max-height: 200px; overflow-y: auto;
}
.sp-card {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 8px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--surface); cursor: pointer;
  transition: all .12s; text-align: left;
  font-family: inherit;
}
.sp-card:hover { border-color: var(--olive); background: rgba(107,142,35,.04); }
.sp-card.selected { border-color: var(--olive); background: rgba(107,142,35,.1); }
.sp-icon { font-size: 20px; color: var(--olive); flex-shrink: 0; margin-top: 1px; }
.sp-info { min-width: 0; }
.sp-name { font-size: 12px; font-weight: 600; color: var(--ink1); }
.sp-desc {
  font-size: 10px; color: var(--ink3); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sp-empty { grid-column: 1/-1; text-align: center; padding: 16px; color: var(--ink3); font-size: 12px; }
</style>
