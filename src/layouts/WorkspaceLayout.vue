<script setup lang="ts">
/**
 * WorkspaceLayout — 主布局壳
 * 
 * 布局结构:
 * ┌────┬──────────┬──────────────┬──────────────┐
 * │Rail│ FileTree  │  ChatPanel   │ CanvasFrame  │
 * │    │ (底座)    │  (对话)      │  (画布)      │
 * │    │          │              │              │
 * └────┴──────────┴──────────────┴──────────────┘
 * 
 * FileTree 始终可见（可折叠）
 * 中间区域根据 activeMode 显示不同面板
 * 右侧画布始终可见
 */
import { ref } from 'vue'
import ActivityRail from '@/components/rail/ActivityRail.vue'
import FileTreePanel from '@/components/filetree/FileTreePanel.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import CanvasFrame from '@/components/canvas/CanvasFrame.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import AgentEditDialog from '@/components/agents/AgentEditDialog.vue'

const activeMode = ref('chat')
const showAgentEditor = ref(false)

// Panel widths (resizable)
const fileTreeWidth = ref(180)
const chatWidth = ref(420)
const isFileTreeCollapsed = ref(false)

// Resize logic
let resizeTarget = ''
let resizeStartX = 0
let resizeStartW = 0

function onResizeStart(e: MouseEvent, target: 'filetree' | 'chat') {
  resizeTarget = target
  resizeStartX = e.clientX
  resizeStartW = target === 'filetree' ? fileTreeWidth.value : chatWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent) {
  const delta = e.clientX - resizeStartX
  const newW = Math.max(140, Math.min(500, resizeStartW + delta))
  if (resizeTarget === 'filetree') {
    fileTreeWidth.value = newW
  } else {
    chatWidth.value = newW
  }
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function onModeSwitch(mode: string) {
  activeMode.value = mode
}
</script>

<template>
  <div class="ws-root">
    <!-- Col 1: Activity Rail -->
    <ActivityRail
      :active="activeMode"
      @switch="onModeSwitch"
    />

    <!-- Col 2: FileTree (底座, 始终可见) -->
    <div
      class="ws-filetree"
      :style="{ width: isFileTreeCollapsed ? '0px' : fileTreeWidth + 'px' }"
    >
      <FileTreePanel v-show="!isFileTreeCollapsed" />
      <div
        class="ws-resize-handle"
        @mousedown.prevent="onResizeStart($event, 'filetree')"
      />
    </div>

    <!-- Col 3: Main Panel (Chat / Agents / Brain / Settings) -->
    <div
      class="ws-main"
      :style="{ width: chatWidth + 'px' }"
    >
      <!-- Chat mode -->
      <ChatPanel v-if="activeMode === 'chat'" />

      <!-- Agent management -->
      <div v-else-if="activeMode === 'agents'" class="ws-placeholder">
        <span class="mso" style="font-size: 36px; color: var(--olive);">smart_toy</span>
        <p>搭子管理</p>
        <button class="ws-action-btn" @click="showAgentEditor = true">
          <span class="mso" style="font-size: 16px;">add</span>
          创建搭子
        </button>
      </div>

      <!-- Brain -->
      <div v-else-if="activeMode === 'brain'" class="ws-placeholder">
        <span class="mso" style="font-size: 36px; color: var(--ink3);">psychology</span>
        <p>长脑子面板</p>
        <p class="ws-hint">（下一步实现）</p>
      </div>

      <!-- Files -->
      <div v-else-if="activeMode === 'files'" class="ws-placeholder">
        <span class="mso" style="font-size: 36px; color: var(--ink3);">description</span>
        <p>编辑区</p>
        <p class="ws-hint">（下一步实现）</p>
      </div>

      <!-- Settings -->
      <SettingsPanel v-else-if="activeMode === 'settings'" />

      <div
        class="ws-resize-handle"
        @mousedown.prevent="onResizeStart($event, 'chat')"
      />
    </div>

    <!-- Col 4: Canvas (始终可见, 填满剩余空间) -->
    <div class="ws-canvas">
      <CanvasFrame />
    </div>

    <!-- Agent Edit Dialog -->
    <AgentEditDialog
      :visible="showAgentEditor"
      @close="showAgentEditor = false"
    />
  </div>
</template>

<style scoped>
.ws-root {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* FileTree column */
.ws-filetree {
  flex-shrink: 0;
  display: flex;
  position: relative;
  border-right: 1px solid var(--border);
  overflow: hidden;
  transition: width 0.2s ease;
}

/* Main panel (chat/agents/etc) */
.ws-main {
  flex-shrink: 0;
  display: flex;
  position: relative;
  border-right: 1px solid var(--border);
  overflow: hidden;
}

/* Canvas (fills remaining space) */
.ws-canvas {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* Resize handle — from code.html line 694-697 */
.ws-resize-handle {
  position: absolute;
  right: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 5;
  transition: background 0.15s;
}
.ws-resize-handle:hover,
.ws-resize-handle:active {
  background: var(--olive);
}

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
.ws-placeholder p {
  font-size: 14px;
  font-weight: 600;
}
.ws-hint {
  font-size: 12px !important;
  font-weight: 400 !important;
  color: var(--ink3);
}
.ws-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: var(--olive);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.1s;
}
.ws-action-btn:hover { transform: scale(1.03); }
</style>
