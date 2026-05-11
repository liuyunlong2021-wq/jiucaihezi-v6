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

// ─── 搭子仓库：搜索 + 分组 + 右键菜单 ───
const agentFilter = ref('')
const presetCollapsed = ref(false)
const customCollapsed = ref(false)
const editAgent = ref<SkillConfig | null>(null)

// 分组 + 过滤
const filteredPresets = computed(() => {
  const q = agentFilter.value.toLowerCase()
  return agentStore.PRESETS.filter(a =>
    !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
  )
})
const filteredCustom = computed(() => {
  const q = agentFilter.value.toLowerCase()
  return agentStore.agents
    .filter(a => !agentStore.PRESETS.some(p => p.id === a.id))
    .filter(a => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
})

function startChatWithAgent(agentId: string) {
  agentStore.selectAgent(agentId)
  if (agentStore.routerEnabled) agentStore.toggleRouter()
  rightPanel.value = ''
}

// ─── 右键菜单 ───
const contextMenu = ref({ show: false, x: 0, y: 0, agent: null as SkillConfig | null, isPreset: false })

function openContextMenu(e: MouseEvent, a: any) {
  const skill = agentStore.agents.find(s => s.id === a.id)
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    agent: skill || null,
    isPreset: agentStore.PRESETS.some(p => p.id === a.id),
  }
}
function editContextAgent() {
  editAgent.value = contextMenu.value.agent
  contextMenu.value.show = false
  showAgentEditor.value = true
}
function aiRewriteContextAgent() {
  editAgent.value = contextMenu.value.agent
  contextMenu.value.show = false
  showAgentEditor.value = true
  // AgentEditDialog 会自动进入编辑模式
}
function exportContextAgent() {
  const a = contextMenu.value.agent
  contextMenu.value.show = false
  if (!a) return
  const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${a.name}.skill.json`
  link.click()
  URL.revokeObjectURL(url)
}
function deleteContextAgent() {
  const a = contextMenu.value.agent
  contextMenu.value.show = false
  if (!a) return
  if (!confirm(`确定删除搭子「${a.name}」？`)) return
  agentStore.deleteAgent(a.id)
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

        <!-- 搭子仓库 — 搜索 + 分组 + 右键菜单（移植自 V4 renderAgentList） -->
        <div v-else-if="rightPanel === 'agents'" class="ws-warehouse">
          <div class="ws-warehouse-head">
            <h3>搭子仓库</h3>
            <button class="ws-wh-add-btn" @click="rightPanel = 'create'" title="创建新搭子">
              <span class="mso" style="font-size:16px">add</span>
            </button>
          </div>
          <!-- 搜索框 -->
          <div class="ws-wh-search">
            <span class="mso" style="font-size:16px;color:var(--ink3)">search</span>
            <input v-model="agentFilter" type="text" placeholder="搜索搭子..." class="ws-wh-search-input" />
          </div>
          <!-- 预设搭子组 -->
          <div class="ws-wh-group">
            <div class="ws-wh-group-head" @click="presetCollapsed = !presetCollapsed">
              <span class="mso ws-wh-chevron" :class="{ collapsed: presetCollapsed }">expand_more</span>
              <span>预设搭子</span>
              <span class="ws-wh-count">{{ filteredPresets.length }}</span>
            </div>
            <div v-if="!presetCollapsed" class="ws-wh-group-body">
              <div v-for="a in filteredPresets" :key="a.id" class="ws-wh-item"
                   :class="{ active: agentStore.currentAgent?.id === a.id }"
                   @click="startChatWithAgent(a.id)"
                   @contextmenu.prevent="openContextMenu($event, a)">
                <div class="ws-wh-item-name">{{ a.name }}</div>
                <div class="ws-wh-item-desc">{{ a.description.slice(0, 50) }}</div>
              </div>
            </div>
          </div>
          <!-- 自定义搭子组 -->
          <div class="ws-wh-group">
            <div class="ws-wh-group-head" @click="customCollapsed = !customCollapsed">
              <span class="mso ws-wh-chevron" :class="{ collapsed: customCollapsed }">expand_more</span>
              <span>我的搭子</span>
              <span class="ws-wh-count">{{ filteredCustom.length }}</span>
            </div>
            <div v-if="!customCollapsed" class="ws-wh-group-body">
              <div v-for="a in filteredCustom" :key="a.id" class="ws-wh-item"
                   :class="{ active: agentStore.currentAgent?.id === a.id }"
                   @click="startChatWithAgent(a.id)"
                   @contextmenu.prevent="openContextMenu($event, a)">
                <div class="ws-wh-item-name">{{ a.name }}</div>
                <div class="ws-wh-item-desc">{{ a.description.slice(0, 50) }}</div>
              </div>
              <div v-if="filteredCustom.length === 0" class="ws-wh-empty">
                还没有自建搭子，点击上方 + 创建一个吧。
              </div>
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

    <!-- 右键菜单（Teleport 到 body，不打断 v-if 链） -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="ws-ctx-overlay" @click="contextMenu.show = false">
        <div class="ws-ctx-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
          <button class="ws-ctx-item" @click="editContextAgent">
            <span class="mso">edit</span> 编辑
          </button>
          <button class="ws-ctx-item" @click="aiRewriteContextAgent">
            <span class="mso">auto_fix_high</span> AI 重写
          </button>
          <button class="ws-ctx-item" @click="exportContextAgent">
            <span class="mso">download</span> 导出 JSON
          </button>
          <button v-if="!contextMenu.isPreset" class="ws-ctx-item ws-ctx-danger" @click="deleteContextAgent">
            <span class="mso">delete</span> 删除
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Dialogs -->
    <AgentEditDialog :visible="showAgentEditor" :editAgent="editAgent" @close="showAgentEditor = false; editAgent = null" />
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

/* ─── 搭子仓库 — 列表 + 分组 + 搜索 ─── */
.ws-warehouse { display: flex; flex-direction: column; height: 100%; }
.ws-warehouse-head {
  padding: 14px 16px; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; justify-content: space-between;
}
.ws-warehouse-head h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }
.ws-wh-add-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1.5px solid var(--line);
  background: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--ink2); transition: all .12s;
}
.ws-wh-add-btn:hover { border-color: var(--olive); color: var(--olive); }
/* 搜索 */
.ws-wh-search {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; margin: 8px 12px 4px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg);
}
.ws-wh-search-input {
  flex: 1; border: none; background: none; outline: none;
  font-size: 13px; color: var(--ink1); font-family: inherit;
}
/* 分组 */
.ws-wh-group { border-bottom: 1px solid var(--line); }
.ws-wh-group-head {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 16px; cursor: pointer; user-select: none;
  font-size: 12px; font-weight: 700; color: var(--ink3);
}
.ws-wh-group-head:hover { background: var(--bg); }
.ws-wh-chevron { font-size: 18px; transition: transform .15s; }
.ws-wh-chevron.collapsed { transform: rotate(-90deg); }
.ws-wh-count {
  margin-left: auto; font-size: 10px; padding: 1px 6px;
  border-radius: 8px; background: var(--line); color: var(--ink3);
}
.ws-wh-group-body { padding: 0 8px 6px; }
/* 搭子项 */
.ws-wh-item {
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  transition: all .12s; margin-bottom: 2px;
}
.ws-wh-item:hover { background: var(--bg); }
.ws-wh-item.active { background: rgba(107,142,35,.08); }
.ws-wh-item-name { font-size: 13px; font-weight: 700; color: var(--ink1); }
.ws-wh-item-desc { font-size: 11px; color: var(--ink3); margin-top: 2px; }
.ws-wh-empty { text-align: center; padding: 16px; font-size: 12px; color: var(--ink3); }

/* ─── 右键菜单 ─── */
.ws-ctx-overlay { position: fixed; inset: 0; z-index: 9999; }
.ws-ctx-menu {
  position: fixed; min-width: 150px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,.15);
}
.ws-ctx-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 12px; border: none; border-radius: 6px;
  background: none; font-size: 13px; color: var(--ink1);
  cursor: pointer; font-family: inherit; transition: background .1s;
}
.ws-ctx-item .mso { font-size: 16px; color: var(--ink3); }
.ws-ctx-item:hover { background: var(--bg); }
.ws-ctx-danger { color: #c0392b; }
.ws-ctx-danger .mso { color: #c0392b; }

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
