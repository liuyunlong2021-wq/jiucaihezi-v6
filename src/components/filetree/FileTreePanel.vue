<script setup lang="ts">
/**
 * FileTreePanel — 搭子列表 + 牛马开关
 * Col 2: 仅显示用户自建搭子
 * 牛马开关 = superpower 路由
 */
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'

const agentStore = useAgentStore()
const sessionStore = useSessionStore()

const searchQuery = ref('')

// 牛马开关（superpower 路由）
const niuMaEnabled = ref(false)

function toggleNiuMa() {
  niuMaEnabled.value = !niuMaEnabled.value
  localStorage.setItem('jc_niuma', String(niuMaEnabled.value))
}

// 迁移 toast
const migrationToast = ref('')

onMounted(() => {
  niuMaEnabled.value = localStorage.getItem('jc_niuma') === 'true'
  sessionStore.loadAllSessions()
  // 显示迁移 toast
  if (agentStore.migrationCount > 0) {
    migrationToast.value = `已从旧版本导入 ${agentStore.migrationCount} 个搭子 ✨`
    setTimeout(() => { migrationToast.value = '' }, 5000)
  }
})

// L2: 粘贴即导入 — 搜索框粘贴长文本自动创建搭子
function onSearchPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') || ''
  if (text.length > 50) {
    // 长文本 = 系统提示词，自动导入
    e.preventDefault()
    const skill = agentStore.importFromText(text)
    if (skill) {
      migrationToast.value = `已导入搭子「${skill.name}」 ✨`
      setTimeout(() => { migrationToast.value = '' }, 3000)
      searchQuery.value = ''
    }
  }
}

// L3: JSON 批量导入
function importJSON() {
  const json = prompt('粘贴旧搭子 JSON 数组 (从旧版本导出):')
  if (!json) return
  const count = agentStore.importFromJSON(json)
  if (count > 0) {
    migrationToast.value = `成功导入 ${count} 个搭子 ✨`
    setTimeout(() => { migrationToast.value = '' }, 3000)
  } else {
    alert('导入失败，请检查 JSON 格式')
  }
}

interface TreeNode {
  id: string
  label: string
  icon: string
  type: 'folder' | 'agent' | 'session' | 'file' | 'creation'
  children?: TreeNode[]
  expanded?: boolean
}

// 只显示用户自建搭子（内置搭子是核心竞争力，绝不外泄）
const agentNodes = computed<TreeNode[]>(() =>
  agentStore.agents
    .filter(a => a.source === 'user')
    .map(a => ({
      id: a.id,
      label: a.name,
      icon: 'smart_toy',
      type: 'agent' as const,
    }))
)

const tree = ref<TreeNode[]>([
  {
    id: 'agents', label: '我的搭子', icon: 'smart_toy',
    type: 'folder', expanded: true,
  },
])

function getChildren(node: TreeNode): TreeNode[] {
  if (node.id === 'agents') return agentNodes.value
  return node.children || []
}

function toggleFolder(node: TreeNode) {
  if (node.type === 'folder') node.expanded = !node.expanded
}

function handleNodeClick(node: TreeNode) {
  if (node.type === 'agent') agentStore.selectAgent(node.id)
}
</script>

<template>
  <div class="ft">
    <!-- Header -->
    <div class="ft-header">
      <span class="ft-title">搭子</span>
      <button
        class="ft-niuma-toggle"
        :class="{ on: niuMaEnabled }"
        @click="toggleNiuMa"
        title="牛马模式（自动路由搭子）"
      >
        <span class="ft-niuma-dot"></span>
        <span class="ft-niuma-label">牛马</span>
      </button>
    </div>

    <!-- Migration toast -->
    <div v-if="migrationToast" class="ft-toast">{{ migrationToast }}</div>

    <!-- Search (粘贴长文本自动导入搭子) -->
    <div class="ft-search">
      <span class="mso" style="font-size: 15px;">search</span>
      <input v-model="searchQuery" placeholder="搜索 / 粘贴旧搭子提示词..." type="text"
             @paste="onSearchPaste" />
      <button class="ft-import-btn" @click="importJSON" title="导入旧搭子 JSON">
        <span class="mso" style="font-size: 14px;">upload</span>
      </button>
    </div>

    <!-- Tree -->
    <div class="ft-tree">
      <div v-for="node in tree" :key="node.id" class="ft-node">
        <div class="ft-item" :class="{ 'is-folder': node.type === 'folder' }" @click="toggleFolder(node)">
          <span v-if="node.type === 'folder'" class="mso ft-twisty"
                :style="{ transform: node.expanded ? 'rotate(90deg)' : 'rotate(0)' }">chevron_right</span>
          <span class="mso ft-icon">{{ node.icon }}</span>
          <span class="ft-label">{{ node.label }}</span>
          <span v-if="getChildren(node).length" class="ft-badge">{{ getChildren(node).length }}</span>
        </div>

        <div v-if="node.expanded && getChildren(node).length" class="ft-children">
          <div v-for="child in getChildren(node)" :key="child.id" class="ft-item ft-child"
               :class="{ active: child.type === 'agent' && agentStore.currentAgent?.id === child.id }"
               @click="handleNodeClick(child)">
            <span class="mso ft-icon">{{ child.icon }}</span>
            <span class="ft-label">{{ child.label }}</span>
          </div>
        </div>

        <div v-if="node.expanded && !getChildren(node).length" class="ft-empty">暂无内容</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ft { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--surface-alt); }
.ft-header {
  padding: 12px 12px 8px;
  display: flex; align-items: center; justify-content: space-between;
}
.ft-title { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); flex: 1; }

/* 牛马药丸开关 — 圆点左=关 右=开 */
.ft-niuma-toggle {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 4px; border-radius: 20px; min-width: 52px;
  border: 1px solid var(--border); background: var(--surface);
  cursor: pointer; font-family: inherit; transition: all .25s;
}
.ft-niuma-toggle:hover { border-color: var(--olive); }
.ft-niuma-toggle.on { background: var(--olive); border-color: var(--olive); flex-direction: row-reverse; }
.ft-niuma-dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--ink3); opacity: .3; transition: all .25s; flex-shrink: 0;
}
.ft-niuma-toggle.on .ft-niuma-dot { background: #fff; opacity: 1; }
.ft-niuma-label {
  font-size: 10px; font-weight: 700; color: var(--ink3); line-height: 1; padding: 0 2px;
}
.ft-niuma-toggle.on .ft-niuma-label { color: #fff; }

.ft-search { padding: 4px 10px 8px; display: flex; align-items: center; gap: 6px; }
.ft-search .mso { color: var(--ink3); flex-shrink: 0; }
.ft-search input {
  width: 100%; border: 1px solid var(--border); background: var(--surface);
  border-radius: 8px; padding: 6px 8px; font-size: 12px; color: var(--ink); outline: none; font-family: inherit;
}
.ft-search input:focus { border-color: var(--olive); }
.ft-tree { flex: 1; overflow-y: auto; padding: 4px 0 60px; }
.ft-item {
  display: flex; align-items: center; gap: 7px; padding: 8px 12px;
  font-size: 12px; color: var(--ink2); cursor: pointer; transition: all 0.12s;
  border-left: 2px solid transparent; user-select: none;
}
.ft-item:hover { background: var(--olive-pale); color: var(--ink); }
.ft-item.active { background: rgba(213, 199, 135, 0.15); color: var(--olive-dark); border-left-color: var(--olive); }
.ft-twisty { font-size: 14px !important; color: var(--ink3); transition: transform 0.15s; flex-shrink: 0; width: 14px; }
.ft-icon { font-size: 16px; flex-shrink: 0; color: var(--ink3); }
.ft-item.active .ft-icon, .ft-item:hover .ft-icon { color: var(--olive); }
.ft-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-badge { font-size: 10px; color: var(--olive-dark); background: rgba(213, 199, 135, 0.12); padding: 2px 6px; border-radius: 999px; }
.ft-child { padding-left: 36px; }
.ft-children { display: block; }
.ft-empty { padding: 8px 12px 8px 36px; font-size: 11px; color: var(--ink3); font-style: italic; }

/* 迁移 toast */
.ft-toast {
  margin: 0 10px 6px; padding: 8px 12px; border-radius: 8px;
  background: var(--olive); color: #fff; font-size: 12px; font-weight: 600;
  text-align: center; animation: toast-in 0.3s ease;
}
@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* 导入按钮 */
.ft-import-btn {
  width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink3); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ft-import-btn:hover { color: var(--olive-dark); border-color: var(--olive); }
</style>
