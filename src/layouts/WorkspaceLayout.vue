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
import AgentWizard from '@/components/agents/AgentWizard.vue'
import BrainPanel from '@/components/brain/BrainPanel.vue'
import EvolutionDiff from '@/components/agents/EvolutionDiff.vue'
import { useAgentStore } from '@/stores/agentStore'
import type { SkillConfig } from '@/types/skill'

const agentStore = useAgentStore()

const activeMode = ref('chat')
const showAgentEditor = ref(false)
const showAgentWizard = ref(false)
const showEvolution = ref(false)
const evolutionSkill = ref<SkillConfig | null>(null)

function openEvolution(skill: SkillConfig) {
  evolutionSkill.value = skill
  showEvolution.value = true
}


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
      <div v-else-if="activeMode === 'agents'" class="ws-agent-panel">
        <div class="ws-agent-header">
          <h3>搭子管理</h3>
          <button class="ws-action-btn" @click="showAgentWizard = true">
            <span class="mso" style="font-size: 16px;">add</span>
            创建搭子
          </button>
        </div>
        <div class="ws-agent-list">
          <div
            v-for="agent in agentStore.agents"
            :key="agent.id"
            class="ws-agent-card"
            :class="{ active: agentStore.currentAgent?.id === agent.id }"
            @click="agentStore.selectAgent(agent.id)"
          >
            <div class="ws-agent-name">{{ agent.name }}</div>
            <div class="ws-agent-desc">{{ agent.description?.slice(0, 60) }}</div>
            <div class="ws-agent-triggers">
              <span v-for="t in agent.triggers?.slice(0, 3)" :key="t" class="ws-trigger-tag">{{ t }}</span>
            </div>
            <div class="ws-agent-actions">
              <button class="ws-agent-act" @click.stop="showAgentEditor = true" title="编辑">
                <span class="mso">edit</span>
              </button>
              <button class="ws-agent-act" @click.stop="openEvolution(agent)" title="反哺">
                <span class="mso">auto_fix_high</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Brain (长脑子) -->
      <BrainPanel v-else-if="activeMode === 'brain'" @close="activeMode = 'chat'" />

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

    <!-- Agent Wizard (colleague-skill) -->
    <AgentWizard v-if="showAgentWizard" @close="showAgentWizard = false" />

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

/* Agent panel */
.ws-agent-panel { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.ws-agent-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; border-bottom: 1px solid var(--line);
}
.ws-agent-header h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }
.ws-agent-header .ws-action-btn { margin-top: 0; padding: 6px 14px; font-size: 12px; }
.ws-agent-list { flex: 1; overflow-y: auto; padding: 12px; }
.ws-agent-card {
  padding: 12px; border-radius: 10px; border: 1.5px solid var(--line);
  margin-bottom: 8px; cursor: pointer; transition: all .15s;
}
.ws-agent-card:hover { border-color: var(--olive); }
.ws-agent-card.active { border-color: var(--olive); background: rgba(107,142,35,.06); }
.ws-agent-name { font-size: 14px; font-weight: 700; color: var(--ink1); }
.ws-agent-desc { font-size: 12px; color: var(--ink3); margin: 4px 0; }
.ws-agent-triggers { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.ws-trigger-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--line); color: var(--ink2);
}
.ws-agent-actions {
  display: flex; gap: 4px; margin-top: 8px; justify-content: flex-end;
}
.ws-agent-act {
  background: none; border: 1px solid var(--line); border-radius: 6px;
  padding: 4px 8px; cursor: pointer;
}
.ws-agent-act .mso { font-size: 16px; color: var(--ink3); }
.ws-agent-act:hover .mso { color: var(--olive); }

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
