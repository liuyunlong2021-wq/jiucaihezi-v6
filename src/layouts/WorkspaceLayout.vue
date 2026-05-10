<script setup lang="ts">
/**
 * WorkspaceLayout — 主布局壳
 *
 * 正确的 4 列布局:
 * ┌────┬──────────┬──────────────┬──────────────────┐
 * │Rail│ FileTree  │  ChatPanel   │   右侧面板       │
 * │    │(用户搭子) │ ★始终显示★  │ (Rail 切换内容)   │
 * │    │ 可隐藏    │  不可隐藏    │   可隐藏          │
 * └────┴──────────┴──────────────┴──────────────────┘
 *
 * Col 1: Activity Rail (固定 52px)
 * Col 2: FileTree — 只显示用户自建搭子（可隐藏）
 * Col 3: ChatPanel — 始终显示，不可隐藏
 * Col 4: 右侧面板 — 由 Rail 切换（可隐藏）
 *   - create: AgentWizard (创建搭子)
 *   - agents: 搭子仓库 (内置搭子列表)
 *   - brain: BrainPanel (长脑子)
 *   - editor: EditorPanel (编辑区) — 待实现
 *   - creation: CreationPanel (创作面板) — 待实现
 *   - storage: StoragePanel (存储空间) — 待实现
 *   - settings: SettingsPanel (设置)
 */
import { ref, computed } from 'vue'
import ActivityRail from '@/components/rail/ActivityRail.vue'
import FileTreePanel from '@/components/filetree/FileTreePanel.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import AgentEditDialog from '@/components/agents/AgentEditDialog.vue'
import AgentWizard from '@/components/agents/AgentWizard.vue'
import BrainPanel from '@/components/brain/BrainPanel.vue'
import EvolutionDiff from '@/components/agents/EvolutionDiff.vue'
import { useAgentStore } from '@/stores/agentStore'
import type { SkillConfig } from '@/types/skill'

const agentStore = useAgentStore()

// ─── Col 4 当前显示的面板（Rail 控制） ───
const rightPanel = ref<string>('')  // 空 = 隐藏
const showAgentEditor = ref(false)
const showEvolution = ref(false)
const evolutionSkill = ref<SkillConfig | null>(null)

// Col 2 / Col 4 隐藏状态
const isFileTreeCollapsed = ref(false)
const isRightPanelCollapsed = computed(() => !rightPanel.value)

// Col 宽度
const fileTreeWidth = ref(180)
const chatWidth = ref(420)
const rightPanelWidth = ref(400)

function openEvolution(skill: SkillConfig) {
  evolutionSkill.value = skill
  showEvolution.value = true
}

// Rail 切换
function onRailSwitch(mode: string) {
  // toggle: 再次点击同一个按钮 → 关闭右侧面板
  if (rightPanel.value === mode) {
    rightPanel.value = ''
  } else {
    rightPanel.value = mode
  }
}

// ─── 搭子仓库：只展示内置搭子（让用户选用，但看不到 SKILL.md 内容） ───
const warehouseAgents = computed(() =>
  agentStore.PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
  }))
)

// ─── Resize logic ───
let resizeTarget = ''
let resizeStartX = 0
let resizeStartW = 0

function onResizeStart(e: MouseEvent, target: 'filetree' | 'chat' | 'right') {
  resizeTarget = target
  resizeStartX = e.clientX
  resizeStartW = target === 'filetree' ? fileTreeWidth.value
    : target === 'chat' ? chatWidth.value
    : rightPanelWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent) {
  const delta = e.clientX - resizeStartX
  const newW = Math.max(140, Math.min(700, resizeStartW + delta))
  if (resizeTarget === 'filetree') fileTreeWidth.value = newW
  else if (resizeTarget === 'chat') chatWidth.value = newW
  else rightPanelWidth.value = Math.max(140, Math.min(700, resizeStartW - delta))
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
    <!-- Col 1: Activity Rail (固定 52px) -->
    <ActivityRail
      :active="rightPanel"
      @switch="onRailSwitch"
    />

    <!-- Col 2: FileTree — 只显示用户自建搭子（可隐藏） -->
    <div
      class="ws-filetree"
      :class="{ collapsed: isFileTreeCollapsed }"
      :style="{ width: isFileTreeCollapsed ? '0px' : fileTreeWidth + 'px' }"
    >
      <FileTreePanel v-show="!isFileTreeCollapsed" />
      <div
        class="ws-resize-handle"
        @mousedown.prevent="onResizeStart($event, 'filetree')"
      />
    </div>

    <!-- Col 3: ChatPanel — ★ 始终显示 ★ -->
    <div class="ws-chat" :style="{ width: chatWidth + 'px' }">
      <ChatPanel />
      <div
        class="ws-resize-handle"
        @mousedown.prevent="onResizeStart($event, 'chat')"
      />
    </div>

    <!-- Col 4: 右侧面板 — 由 Rail 切换（可隐藏） -->
    <div
      class="ws-right"
      :class="{ collapsed: isRightPanelCollapsed }"
      :style="{ width: isRightPanelCollapsed ? '0px' : rightPanelWidth + 'px' }"
    >
      <div v-if="!isRightPanelCollapsed" class="ws-right-inner">

        <!-- 创建搭子 (colleague-skill wizard) -->
        <AgentWizard v-if="rightPanel === 'create'" @close="rightPanel = ''" />

        <!-- 搭子仓库（只展示名称+描述，不暴露 SKILL.md） -->
        <div v-else-if="rightPanel === 'agents'" class="ws-warehouse">
          <div class="ws-warehouse-head">
            <h3>搭子仓库</h3>
            <span class="ws-warehouse-hint">点击搭子开始对话</span>
          </div>
          <div class="ws-warehouse-list">
            <div
              v-for="a in warehouseAgents"
              :key="a.id"
              class="ws-warehouse-card"
              :class="{ active: agentStore.currentAgent?.id === a.id }"
              @click="agentStore.selectAgent(a.id)"
            >
              <span class="mso ws-warehouse-icon">smart_toy</span>
              <div>
                <div class="ws-warehouse-name">{{ a.name }}</div>
                <div class="ws-warehouse-desc">{{ a.description?.slice(0, 50) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 长脑子 -->
        <BrainPanel v-else-if="rightPanel === 'brain'" @close="rightPanel = ''" />

        <!-- 编辑区 — 5b-2 实现 -->
        <div v-else-if="rightPanel === 'editor'" class="ws-placeholder">
          <span class="mso" style="font-size: 36px; color: var(--olive);">edit_note</span>
          <p>正文编辑区</p>
          <p class="ws-hint">（5b-2 迁移）</p>
        </div>

        <!-- 创作面板 — 5b-2 实现 -->
        <div v-else-if="rightPanel === 'creation'" class="ws-placeholder">
          <span class="mso" style="font-size: 36px; color: var(--olive);">palette</span>
          <p>创作面板</p>
          <p class="ws-hint">（5b-2 迁移）</p>
        </div>

        <!-- 存储空间 — 5b-2 实现 -->
        <div v-else-if="rightPanel === 'storage'" class="ws-placeholder">
          <span class="mso" style="font-size: 36px; color: var(--olive);">inventory_2</span>
          <p>存储空间</p>
          <p class="ws-hint">文本 · 图片 · 视频</p>
        </div>

        <!-- 设置 -->
        <SettingsPanel v-else-if="rightPanel === 'settings'" />

      </div>

      <div
        v-if="!isRightPanelCollapsed"
        class="ws-resize-handle ws-resize-left"
        @mousedown.prevent="onResizeStart($event, 'right')"
      />
    </div>

    <!-- Agent Edit Dialog -->
    <AgentEditDialog
      :visible="showAgentEditor"
      @close="showAgentEditor = false"
    />

    <!-- Evolution Diff (darwin-skill) -->
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
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

/* Col 2: FileTree */
.ws-filetree {
  position: relative;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  transition: width 0.2s ease;
  overflow: hidden;
}
.ws-filetree.collapsed { width: 0 !important; border: none; }

/* Col 3: Chat — 始终可见 */
.ws-chat {
  position: relative;
  flex-shrink: 0;
  min-width: 300px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

/* Col 4: 右侧面板 */
.ws-right {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  transition: width 0.2s ease;
}
.ws-right.collapsed { width: 0 !important; flex: 0; }
.ws-right-inner {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
}

/* Resize handle */
.ws-resize-handle {
  position: absolute;
  top: 0; right: 0;
  width: 4px; height: 100%;
  cursor: col-resize;
  z-index: 5;
  background: transparent;
}
.ws-resize-handle:hover { background: var(--olive); opacity: 0.3; }
.ws-resize-left { right: auto; left: 0; }

/* Placeholder for not-yet-built panels */
.ws-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--ink3);
  background: var(--surface);
}
.ws-placeholder p { font-size: 14px; font-weight: 600; }
.ws-hint { font-size: 12px !important; font-weight: 400 !important; color: var(--ink3); }

/* 搭子仓库 */
.ws-warehouse { display: flex; flex-direction: column; height: 100%; }
.ws-warehouse-head {
  padding: 16px; border-bottom: 1px solid var(--line);
  display: flex; justify-content: space-between; align-items: center;
}
.ws-warehouse-head h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }
.ws-warehouse-hint { font-size: 11px; color: var(--ink3); }
.ws-warehouse-list { flex: 1; overflow-y: auto; padding: 12px; }
.ws-warehouse-card {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; border-radius: 10px; border: 1.5px solid var(--line);
  margin-bottom: 8px; cursor: pointer; transition: all .15s;
}
.ws-warehouse-card:hover { border-color: var(--olive); }
.ws-warehouse-card.active { border-color: var(--olive); background: rgba(107,142,35,.06); }
.ws-warehouse-icon { font-size: 24px; color: var(--olive); }
.ws-warehouse-name { font-size: 14px; font-weight: 700; color: var(--ink1); }
.ws-warehouse-desc { font-size: 12px; color: var(--ink3); margin-top: 2px; }

/* Evolution overlay */
.ws-evo-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center;
}
.ws-evo-dialog {
  width: 700px; max-width: 95vw; max-height: 85vh;
  border-radius: 16px; overflow: hidden;
  background: var(--paper);
  box-shadow: 0 8px 40px rgba(0,0,0,.2);
}
</style>
