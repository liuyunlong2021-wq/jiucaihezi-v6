<script setup lang="ts">
/**
 * WorkspaceLayout — 主布局壳
 *
 * 正确的 5 列布局:
 * ┌────┬──────────┬──────────┬──────────────┬──────────────────┐
 * │Rail│ FileTree  │ History  │  ChatPanel   │   右侧面板       │
 * │    │(我的搭子) │(对话记录)│ ★始终显示★  │ (Rail 切换内容)   │
 * │    │ 可隐藏    │ 可隐藏   │  不可隐藏    │   可隐藏          │
 * └────┴──────────┴──────────┴──────────────┴──────────────────┘
 */
import { ref, computed } from 'vue'
import ActivityRail from '@/components/rail/ActivityRail.vue'
import FileTreePanel from '@/components/filetree/FileTreePanel.vue'
import HistoryPanel from '@/components/session/HistoryPanel.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import AgentEditDialog from '@/components/agents/AgentEditDialog.vue'
import AgentWizard from '@/components/agents/AgentWizard.vue'
import BrainPanel from '@/components/brain/BrainPanel.vue'
import EvolutionDiff from '@/components/agents/EvolutionDiff.vue'
import EditorPanel from '@/components/editor/EditorPanel.vue'
import CreationPanel from '@/components/creation/CreationPanel.vue'
import StoragePanel from '@/components/storage/StoragePanel.vue'
import { useAgentStore } from '@/stores/agentStore'
import type { SkillConfig } from '@/types/skill'

const agentStore = useAgentStore()

// ─── Col 5 当前面板 ───
const rightPanel = ref<string>('')
const showAgentEditor = ref(false)
const showEvolution = ref(false)
const evolutionSkill = ref<SkillConfig | null>(null)

// Col 2 / Col 3 / Col 5 隐藏
const isFileTreeCollapsed = ref(false)
const isHistoryCollapsed = ref(false)
const isRightPanelCollapsed = computed(() => !rightPanel.value)

// 宽度
const fileTreeWidth = ref(160)
const historyWidth = ref(200)
const chatWidth = ref(400)
const rightPanelWidth = ref(420)

function openEvolution(skill: SkillConfig) {
  evolutionSkill.value = skill
  showEvolution.value = true
}

function onRailSwitch(mode: string) {
  if (rightPanel.value === mode) {
    rightPanel.value = ''
  } else {
    rightPanel.value = mode
  }
}

// ─── 搭子仓库：方形卡片，点击发起聊天 ───
const warehouseAgents = computed(() =>
  agentStore.PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    triggers: p.triggers || [],
  }))
)

function startChatWithAgent(agentId: string) {
  agentStore.selectAgent(agentId)
  // 关闭路由
  if (agentStore.routerEnabled) agentStore.toggleRouter()
  // 关闭右侧面板
  rightPanel.value = ''
}

// ─── Resize ───
let resizeTarget = ''
let resizeStartX = 0
let resizeStartW = 0

function onResizeStart(e: MouseEvent, target: 'filetree' | 'history' | 'chat' | 'right') {
  resizeTarget = target
  resizeStartX = e.clientX
  resizeStartW = target === 'filetree' ? fileTreeWidth.value
    : target === 'history' ? historyWidth.value
    : target === 'chat' ? chatWidth.value
    : rightPanelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent) {
  const delta = e.clientX - resizeStartX
  if (resizeTarget === 'filetree') fileTreeWidth.value = Math.max(120, Math.min(400, resizeStartW + delta))
  else if (resizeTarget === 'history') historyWidth.value = Math.max(120, Math.min(400, resizeStartW + delta))
  else if (resizeTarget === 'chat') chatWidth.value = Math.max(280, Math.min(700, resizeStartW + delta))
  else rightPanelWidth.value = Math.max(200, Math.min(800, resizeStartW - delta))
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
</script>

<template>
  <div class="ws-root">
    <!-- Col 1: Activity Rail -->
    <ActivityRail :active="rightPanel" @switch="onRailSwitch" />

    <!-- Col 2: FileTree — 我的搭子（可隐藏） -->
    <div class="ws-col ws-filetree" :class="{ collapsed: isFileTreeCollapsed }"
         :style="{ width: isFileTreeCollapsed ? '0px' : fileTreeWidth + 'px' }">
      <FileTreePanel v-show="!isFileTreeCollapsed" />
      <div class="ws-resize-handle" @mousedown.prevent="onResizeStart($event, 'filetree')" />
    </div>

    <!-- Col 3: History — 对话记录（可隐藏） -->
    <div class="ws-col ws-history" :class="{ collapsed: isHistoryCollapsed }"
         :style="{ width: isHistoryCollapsed ? '0px' : historyWidth + 'px' }">
      <HistoryPanel v-show="!isHistoryCollapsed" />
      <div class="ws-resize-handle" @mousedown.prevent="onResizeStart($event, 'history')" />
    </div>

    <!-- Col 4: ChatPanel — ★ 始终显示 ★ -->
    <div class="ws-col ws-chat" :style="{ width: chatWidth + 'px' }">
      <ChatPanel />
      <div class="ws-resize-handle" @mousedown.prevent="onResizeStart($event, 'chat')" />
    </div>

    <!-- Col 5: 右侧面板 — Rail 切换（可隐藏） -->
    <div class="ws-col ws-right" :class="{ collapsed: isRightPanelCollapsed }"
         :style="{ width: isRightPanelCollapsed ? '0px' : rightPanelWidth + 'px' }">
      <div v-if="!isRightPanelCollapsed" class="ws-right-inner">

        <!-- 创建搭子 → Col 5 -->
        <AgentWizard v-if="rightPanel === 'create'" @close="rightPanel = ''" />

        <!-- 搭子仓库 — 方形卡片排布 -->
        <div v-else-if="rightPanel === 'agents'" class="ws-warehouse">
          <div class="ws-warehouse-head">
            <h3>搭子仓库</h3>
          </div>
          <div class="ws-warehouse-grid">
            <div v-for="a in warehouseAgents" :key="a.id" class="ws-wh-card"
                 :class="{ active: agentStore.currentAgent?.id === a.id }">
              <div class="ws-wh-name">{{ a.name }}</div>
              <div class="ws-wh-desc">{{ a.description.slice(0, 40) }}</div>
              <div class="ws-wh-triggers" v-if="a.triggers.length">
                <span v-for="t in a.triggers.slice(0, 3)" :key="t" class="ws-wh-tag">{{ t }}</span>
              </div>
              <button class="ws-wh-chat-btn" @click="startChatWithAgent(a.id)">
                <span class="mso" style="font-size:14px">chat</span> 发起聊天
              </button>
            </div>
          </div>
        </div>

        <!-- 长脑子 -->
        <BrainPanel v-else-if="rightPanel === 'brain'" @close="rightPanel = ''" />

        <!-- 编辑区 -->
        <EditorPanel v-else-if="rightPanel === 'editor'" />

        <!-- 创作面板 -->
        <CreationPanel v-else-if="rightPanel === 'creation'" />

        <!-- 存储空间 -->
        <StoragePanel v-else-if="rightPanel === 'storage'" />

        <!-- 设置 -->
        <SettingsPanel v-else-if="rightPanel === 'settings'" />

      </div>
      <div v-if="!isRightPanelCollapsed" class="ws-resize-handle ws-resize-left"
           @mousedown.prevent="onResizeStart($event, 'right')" />
    </div>

    <!-- Dialogs -->
    <AgentEditDialog :visible="showAgentEditor" @close="showAgentEditor = false" />
    <Teleport to="body">
      <div v-if="showEvolution && evolutionSkill" class="ws-evo-overlay" @click.self="showEvolution = false">
        <div class="ws-evo-dialog">
          <EvolutionDiff :skill="evolutionSkill" @close="showEvolution = false" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ws-root {
  display: flex; width: 100vw; height: 100vh; overflow: hidden; background: var(--bg);
}

/* Generic column */
.ws-col { position: relative; flex-shrink: 0; overflow: hidden; }
.ws-col.collapsed { width: 0 !important; border: none; }

.ws-filetree { border-right: 1px solid var(--border); transition: width .2s; }
.ws-history { border-right: 1px solid var(--border); transition: width .2s; }
.ws-chat { min-width: 280px; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.ws-right { flex: 1; min-width: 0; transition: width .2s; }
.ws-right.collapsed { flex: 0; }
.ws-right-inner { width: 100%; height: 100%; overflow-y: auto; background: var(--surface); }

/* Resize handle */
.ws-resize-handle {
  position: absolute; top: 0; right: 0; width: 4px; height: 100%;
  cursor: col-resize; z-index: 5; background: transparent;
}
.ws-resize-handle:hover { background: var(--olive); opacity: .3; }
.ws-resize-left { right: auto; left: 0; }

/* Placeholder */
.ws-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; width: 100%; height: 100%; color: var(--ink3); background: var(--surface);
}
.ws-placeholder p { font-size: 14px; font-weight: 600; }
.ws-hint { font-size: 12px !important; font-weight: 400 !important; color: var(--ink3); }

/* ─── 搭子仓库 — 方形卡片 ─── */
.ws-warehouse { display: flex; flex-direction: column; height: 100%; }
.ws-warehouse-head {
  padding: 16px; border-bottom: 1px solid var(--line);
}
.ws-warehouse-head h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }
.ws-warehouse-grid {
  flex: 1; overflow-y: auto; padding: 12px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px; align-content: start;
}
.ws-wh-card {
  padding: 14px; border-radius: 12px; border: 1.5px solid var(--line);
  display: flex; flex-direction: column; gap: 6px; transition: all .15s;
}
.ws-wh-card:hover { border-color: var(--olive); box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.ws-wh-card.active { border-color: var(--olive); background: rgba(107,142,35,.05); }
.ws-wh-name { font-size: 14px; font-weight: 700; color: var(--ink1); }
.ws-wh-desc { font-size: 12px; color: var(--ink3); line-height: 1.5; }
.ws-wh-triggers { display: flex; gap: 4px; flex-wrap: wrap; }
.ws-wh-tag {
  font-size: 10px; padding: 2px 7px; border-radius: 4px;
  background: var(--olive-pale); color: var(--olive-dark); font-weight: 600;
}
.ws-wh-chat-btn {
  margin-top: 4px; padding: 7px 0; border: none; border-radius: 8px;
  background: var(--olive); color: #fff; font-size: 12px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  gap: 4px; font-family: inherit; transition: transform .1s;
}
.ws-wh-chat-btn:hover { transform: scale(1.02); }

/* Evolution overlay */
.ws-evo-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center;
}
.ws-evo-dialog {
  width: 700px; max-width: 95vw; max-height: 85vh;
  border-radius: 16px; overflow: hidden; background: var(--paper);
  box-shadow: 0 8px 40px rgba(0,0,0,.2);
}
</style>
