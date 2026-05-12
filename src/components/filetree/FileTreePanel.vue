<script setup lang="ts">
/**
 * FileTreePanel — 文件面板（Col 2）
 * 5个tab：文本、图片、视频、知识库、搭子
 */
import { ref, computed, onMounted } from 'vue'
import { useFileStore, type FileEntry } from '@/composables/useFileStore'
import { useAgentStore } from '@/stores/agentStore'
import { emitEvent } from '@/utils/eventBus'

const fileStore = useFileStore()
const agentStore = useAgentStore()

type Tab = 'text' | 'image' | 'video' | 'knowledge' | 'skill'
const activeTab = ref<Tab>('text')
const searchQuery = ref('')
const selectAll = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const contextMenu = ref({ show: false, x: 0, y: 0, file: null as FileEntry | null })

const tabItems = [
  { key: 'text', icon: 'article', label: '文本' },
  { key: 'image', icon: 'image', label: '图片' },
  { key: 'video', icon: 'movie', label: '视频' },
  { key: 'knowledge', icon: 'psychology', label: '知识库' },
  { key: 'skill', icon: 'smart_toy', label: '搭子' },
] as const

const items = ref<FileEntry[]>([])

async function loadTab() {
  selectAll.value = false
  selectedIds.value.clear()
  items.value = await fileStore.loadByCategory(activeTab.value)
}

onMounted(loadTab)

function switchTab(tab: Tab) {
  activeTab.value = tab
  loadTab()
}

const filteredItems = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return items.value
  return items.value.filter(f => f.name.toLowerCase().includes(q))
})

function toggleSelectAll() {
  selectAll.value = !selectAll.value
  if (selectAll.value) {
    selectedIds.value = new Set(filteredItems.value.map(f => f.id))
  } else {
    selectedIds.value.clear()
  }
}

async function deleteSelected() {
  if (selectedIds.value.size === 0) return
  if (!confirm(`确定删除 ${selectedIds.value.size} 个文件？`)) return
  for (const id of selectedIds.value) {
    await fileStore.deleteFile(id)
  }
  selectedIds.value.clear()
  selectAll.value = false
  await loadTab()
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    const reader = new FileReader()
    reader.onload = async () => {
      const content = reader.result as string
      if (activeTab.value === 'text') await fileStore.addText(file.name, content)
      else if (activeTab.value === 'image') await fileStore.addMedia(file.name, content, 'image', file.type)
      else if (activeTab.value === 'video') await fileStore.addMedia(file.name, content, 'video', file.type)
      await loadTab()
    }
    if (activeTab.value === 'image' || activeTab.value === 'video') reader.readAsDataURL(file)
    else reader.readAsText(file)
  }
  input.value = ''
}

function openContextMenu(e: MouseEvent, file: FileEntry) {
  e.preventDefault()
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, file }
}
function closeContextMenu() { contextMenu.value.show = false }

function renameFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  const newName = prompt('重命名', f.name)
  if (newName && newName !== f.name) { fileStore.updateFile(f.id, { name: newName }); loadTab() }
}
function referenceFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) emitEvent('reference-file', { name: f.name, content: f.content })
}
function openInEditor() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  emitEvent('open-in-editor', { name: f.name, content: f.content })
  emitEvent('switch-panel', 'editor')
}
function deleteFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) { fileStore.deleteFile(f.id); loadTab() }
}

async function knowledgeBackup() {
  const entries = await fileStore.loadByCategory('knowledge')
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `知识库备份_${new Date().toLocaleDateString('zh-CN')}.json`
  a.click(); URL.revokeObjectURL(url)
}
async function knowledgeDelete() {
  if (!confirm('确定删除所有知识库内容？此操作不可恢复。')) return
  await fileStore.deleteByCategory('knowledge'); await loadTab()
}
async function knowledgeMerge(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const entries = JSON.parse(text) as FileEntry[]
    for (const entry of entries) {
      if (entry.category === 'knowledge') await fileStore.addKnowledge({ name: entry.name, content: entry.content, topic: entry.topic, skillId: entry.skillId, indexed: entry.indexed })
    }
    await loadTab()
  } catch { alert('文件格式不正确') }
  input.value = ''
}
</script>

<template>
  <div class="fp" @click="closeContextMenu">
    <div class="fp-tabs">
      <button v-for="t in tabItems" :key="t.key" class="fp-tab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key as Tab)">
        <span class="mso" style="font-size:14px">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </button>
    </div>

    <template v-if="activeTab === 'knowledge'">
      <div class="fp-knowledge">
        <div class="fp-knowledge-info">
          <span class="mso" style="font-size:32px;color:var(--olive)">psychology</span>
          <div class="fp-knowledge-count">{{ items.length }} 条知识</div>
        </div>
        <div class="fp-knowledge-actions">
          <label class="fp-kb-btn"><span class="mso">merge</span> 合并<input type="file" accept=".json" @change="knowledgeMerge" hidden /></label>
          <button class="fp-kb-btn" @click="knowledgeBackup"><span class="mso">download</span> 备份</button>
          <button class="fp-kb-btn danger" @click="knowledgeDelete"><span class="mso">delete</span> 删除</button>
        </div>
        <div class="fp-list">
          <div v-for="f in items" :key="f.id" class="fp-item"><span class="fp-item-name">{{ f.name }}</span><span class="fp-item-meta">{{ f.topic || '' }}</span></div>
          <div v-if="items.length === 0" class="fp-empty">知识库为空，开启整理后自动积累</div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="fp-toolbar">
        <div class="fp-search"><span class="mso" style="font-size:14px">search</span><input v-model="searchQuery" placeholder="搜索..." /></div>
        <button class="fp-tool-btn" :class="{ active: selectAll }" @click="toggleSelectAll"><span class="mso">select_all</span></button>
        <button class="fp-tool-btn" :disabled="selectedIds.size === 0" @click="deleteSelected"><span class="mso">delete</span></button>
        <label v-if="activeTab !== 'skill'" class="fp-tool-btn"><span class="mso">upload</span><input type="file" multiple @change="handleUpload" hidden /></label>
      </div>
      <div class="fp-list">
        <template v-if="activeTab === 'skill'">
          <div v-for="s in agentStore.getMySkills()" :key="s.id" class="fp-item"><span class="mso" style="font-size:16px;color:var(--olive)">folder</span><span class="fp-item-name">{{ s.name }}</span><span class="fp-item-meta">{{ s.triggers?.slice(0,2).join(', ') }}</span></div>
          <div v-if="agentStore.getMySkills().length === 0" class="fp-empty">还没有搭子</div>
        </template>
        <template v-else-if="activeTab === 'image' || activeTab === 'video'">
          <div class="fp-media-grid">
            <div v-for="f in filteredItems" :key="f.id" class="fp-media-item" @contextmenu="openContextMenu($event, f)">
              <img v-if="activeTab === 'image'" :src="f.content" class="fp-media-thumb" />
              <div v-else class="fp-media-thumb video"><span class="mso">movie</span></div>
              <span class="fp-media-name">{{ f.name }}</span>
            </div>
          </div>
          <div v-if="filteredItems.length === 0" class="fp-empty">暂无{{ activeTab === 'image' ? '图片' : '视频' }}</div>
        </template>
        <template v-else>
          <div v-for="f in filteredItems" :key="f.id" class="fp-item" @contextmenu="openContextMenu($event, f)"><span class="mso" style="font-size:16px;color:var(--ink3)">description</span><span class="fp-item-name">{{ f.name }}</span><span class="fp-item-meta">{{ new Date(f.updatedAt).toLocaleDateString('zh-CN') }}</span></div>
          <div v-if="filteredItems.length === 0" class="fp-empty">暂无文本文件</div>
        </template>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="contextMenu.show" class="fp-ctx-overlay" @click="closeContextMenu">
        <div class="fp-ctx-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
          <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
          <button class="fp-ctx-item" @click="referenceFile"><span class="mso">link</span> 引用</button>
          <button v-if="activeTab === 'text'" class="fp-ctx-item" @click="openInEditor"><span class="mso">edit_note</span> 在编辑区打开</button>
          <button class="fp-ctx-item danger" @click="deleteFile"><span class="mso">delete</span> 删除</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.fp { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--surface-alt); }
.fp-tabs { display: flex; gap: 2px; padding: 8px 6px 0; border-bottom: 1px solid var(--line); overflow-x: auto; }
.fp-tab { display: flex; align-items: center; gap: 2px; padding: 5px 7px; border: none; border-radius: 6px 6px 0 0; background: transparent; color: var(--ink3); cursor: pointer; font-size: 11px; font-weight: 600; font-family: inherit; white-space: nowrap; }
.fp-tab:hover { color: var(--ink1); background: var(--surface); }
.fp-tab.active { color: var(--olive); background: var(--surface); border-bottom: 2px solid var(--olive); }
.fp-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
.fp-search { flex: 1; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); }
.fp-search input { flex: 1; border: none; background: none; outline: none; font-size: 11px; color: var(--ink1); font-family: inherit; }
.fp-tool-btn { width: 26px; height: 26px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.fp-tool-btn:hover { color: var(--olive); border-color: var(--olive); }
.fp-tool-btn.active { color: var(--olive); background: rgba(107,142,35,.1); border-color: var(--olive); }
.fp-tool-btn:disabled { opacity: .3; cursor: not-allowed; }
.fp-tool-btn .mso { font-size: 15px; }
.fp-list { flex: 1; overflow-y: auto; padding: 4px 6px; }
.fp-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.fp-item:hover { background: var(--surface); }
.fp-item-name { flex: 1; font-size: 12px; font-weight: 500; color: var(--ink1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-item-meta { font-size: 10px; color: var(--ink3); flex-shrink: 0; }
.fp-empty { text-align: center; padding: 24px; font-size: 12px; color: var(--ink3); }
.fp-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; padding: 6px; }
.fp-media-item { display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; }
.fp-media-thumb { width: 68px; height: 68px; border-radius: 6px; object-fit: cover; border: 1px solid var(--line); }
.fp-media-thumb.video { display: flex; align-items: center; justify-content: center; background: var(--surface); color: var(--ink3); }
.fp-media-name { font-size: 10px; color: var(--ink2); max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-knowledge { display: flex; flex-direction: column; height: 100%; }
.fp-knowledge-info { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; }
.fp-knowledge-count { font-size: 14px; font-weight: 700; color: var(--ink1); }
.fp-knowledge-actions { display: flex; gap: 8px; padding: 0 12px 12px; justify-content: center; }
.fp-kb-btn { display: flex; align-items: center; gap: 4px; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink1); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.fp-kb-btn:hover { border-color: var(--olive); color: var(--olive); }
.fp-kb-btn.danger:hover { border-color: #e53935; color: #e53935; }
.fp-kb-btn .mso { font-size: 15px; }
.fp-ctx-overlay { position: fixed; inset: 0; z-index: 9999; }
.fp-ctx-menu { position: fixed; min-width: 140px; padding: 6px; background: var(--paper); border: 2px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.fp-ctx-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 10px; border: none; border-radius: 6px; background: transparent; color: var(--ink1); font-size: 12px; cursor: pointer; font-family: inherit; }
.fp-ctx-item:hover { background: var(--surface); }
.fp-ctx-item.danger:hover { color: #e53935; }
.fp-ctx-item .mso { font-size: 15px; color: var(--ink2); }
</style>
