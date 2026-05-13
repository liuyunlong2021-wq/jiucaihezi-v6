<script setup lang="ts">
/**
 * FileTreePanel — 文件面板（Col 2）
 * 5个tab：文本、图片、视频、知识库、搭子
 */
import { ref, computed, onMounted } from 'vue'
import { useFileStore, type FileEntry } from '@/composables/useFileStore'
import { useAgentStore } from '@/stores/agentStore'
import { emitEvent } from '@/utils/eventBus'
import { parseSkillMd } from '@/types/skill'

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

function toggleItem(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
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

// ─── 合并所选（合并为文件夹） ───
async function mergeSelected() {
  if (selectedIds.value.size < 2) return
  const folderName = prompt('文件夹名称', '新文件夹')
  if (!folderName) return
  const folderId = `folder_${Date.now().toString(36)}`
  // 创建文件夹记录
  await fileStore.addFile({
    category: activeTab.value as FileEntry['category'],
    name: folderName,
    content: '',
    mimeType: 'folder',
    size: 0,
    metadata: { isFolder: true, children: Array.from(selectedIds.value) },
  })
  // 将选中文件标记为属于该文件夹
  for (const id of selectedIds.value) {
    await fileStore.updateFile(id, { folderId })
  }
  selectedIds.value.clear()
  selectAll.value = false
  await loadTab()
}

// ─── 搭子tab上传文件夹（解析 skill.md） ───
async function handleSkillUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return

  let foundSkill = false
  const files = Array.from(input.files)

  // 查找 skill.md 或 SKILL.md
  for (const file of files) {
    if (/skill\.md$/i.test(file.name)) {
      const text = await file.text()
      const parsed = parseSkillMd(text)

      if (parsed.name || parsed.skillContent) {
        const skill = {
          id: 'upload_' + Date.now().toString(36),
          name: parsed.name || '导入搭子',
          description: parsed.description || '',
          oneLineDesc: parsed.description || '',
          triggers: parsed.triggers || [],
          skillContent: parsed.skillContent || text,
          references: [],
          examples: [],
          version: 1,
          source: 'user' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          evolutionLog: [],
        }
        agentStore.createAgent(skill)
        agentStore.moveToMy(skill.id)
        foundSkill = true
      }
      break
    }
  }

  if (!foundSkill) {
    alert('未找到 SKILL.md 文件，无法导入搭子')
  } else {
    await loadTab()
  }
  input.value = ''
}

// ─── 图片/视频导入创作面板 ───
function importToCreation() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) {
    emitEvent('import-to-creation', { name: f.name, url: f.content, type: f.category })
    emitEvent('switch-panel', 'creation')
  }
}

// ─── 文件夹相关 ───
const currentFolder = ref<FileEntry | null>(null)

function openFolder(folder: FileEntry) {
  currentFolder.value = folder
}

function exitFolder() {
  currentFolder.value = null
}

function deleteFolderItem() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  if (f.mimeType === 'folder') {
    if (!confirm(`确定删除文件夹「${f.name}」及其所有内容？`)) return
    const children = (f.metadata?.children as string[]) || []
    for (const cid of children) { fileStore.deleteFile(cid) }
  }
  fileStore.deleteFile(f.id)
  loadTab()
}

// 过滤：排除已在文件夹中的文件（除非正在查看文件夹）
const displayItems = computed(() => {
  if (currentFolder.value) {
    const children = (currentFolder.value.metadata?.children as string[]) || []
    return items.value.filter(f => children.includes(f.id))
  }
  return filteredItems.value.filter(f => !f.folderId)
})

// 文件夹列表
const folders = computed(() => {
  return items.value.filter(f => f.mimeType === 'folder')
})
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
      <!-- 工具栏 -->
      <div class="fp-toolbar">
        <div class="fp-search"><span class="mso" style="font-size:14px">search</span><input v-model="searchQuery" placeholder="搜索..." /></div>
        <button class="fp-tool-btn" :class="{ active: selectAll }" @click="toggleSelectAll" title="全选"><span class="mso">select_all</span></button>
        <button class="fp-tool-btn" :disabled="selectedIds.size === 0" @click="deleteSelected" title="删除所选"><span class="mso">delete</span></button>
        <button v-if="(activeTab as string) !== 'knowledge'" class="fp-tool-btn" :disabled="selectedIds.size < 2" @click="mergeSelected" title="合并所选"><span class="mso">create_new_folder</span></button>
        <label v-if="activeTab === 'skill'" class="fp-tool-btn" title="上传搭子文件夹">
          <span class="mso">upload</span>
          <input type="file" multiple webkitdirectory @change="handleSkillUpload" hidden />
        </label>
        <label v-else-if="(activeTab as string) !== 'skill'" class="fp-tool-btn" title="上传">
          <span class="mso">upload</span>
          <input type="file" multiple @change="handleUpload" hidden />
        </label>
      </div>

      <!-- 文件夹面包屑 -->
      <div v-if="currentFolder" class="fp-breadcrumb">
        <button class="fp-bread-btn" @click="exitFolder"><span class="mso">arrow_back</span> 返回</button>
        <span class="fp-bread-name">{{ currentFolder.name }}</span>
      </div>

      <div class="fp-list">
        <!-- 搭子 tab -->
        <template v-if="activeTab === 'skill'">
          <div v-for="s in agentStore.getMySkills()" :key="s.id" class="fp-item skill">
            <span class="mso" style="font-size:16px;color:var(--olive)">folder</span>
            <span class="fp-item-name">{{ s.name }}</span>
            <span class="fp-item-meta">{{ s.triggers?.slice(0,2).join(', ') }}</span>
          </div>
          <div v-if="agentStore.getMySkills().length === 0" class="fp-empty">还没有搭子</div>
        </template>

        <!-- 图片/视频 tab -->
        <template v-else-if="activeTab === 'image' || activeTab === 'video'">
          <div class="fp-media-grid">
            <div v-for="f in displayItems" :key="f.id" class="fp-media-item"
                 :class="{ selected: selectedIds.has(f.id) }"
                 @click="selectAll ? toggleItem(f.id) : null"
                 @contextmenu="openContextMenu($event, f)">
              <img v-if="activeTab === 'image'" :src="f.content" class="fp-media-thumb" />
              <div v-else class="fp-media-thumb video"><span class="mso">movie</span></div>
              <span class="fp-media-name">{{ f.name }}</span>
            </div>
          </div>
          <div v-if="displayItems.length === 0" class="fp-empty">暂无{{ activeTab === 'image' ? '图片' : '视频' }}</div>
        </template>

        <!-- 文本 tab -->
        <template v-else>
          <!-- 文件夹 -->
          <div v-for="f in folders" :key="f.id" class="fp-item folder" @dblclick="openFolder(f)" @contextmenu="openContextMenu($event, f)">
            <span class="mso" style="font-size:16px;color:#ff9800">folder</span>
            <span class="fp-item-name">{{ f.name }}</span>
            <span class="fp-item-meta">{{ ((f.metadata?.children as string[]) || []).length }} 个文件</span>
          </div>
          <!-- 文件 -->
          <div v-for="f in displayItems.filter(i => i.mimeType !== 'folder')" :key="f.id" class="fp-item"
               :class="{ selected: selectedIds.has(f.id) }"
               @click="selectAll ? toggleItem(f.id) : null"
               @contextmenu="openContextMenu($event, f)">
            <input v-if="selectAll" type="checkbox" :checked="selectedIds.has(f.id)" @click.stop="toggleItem(f.id)" />
            <span class="mso" style="font-size:16px;color:var(--ink3)">description</span>
            <span class="fp-item-name">{{ f.name }}</span>
            <span class="fp-item-meta">{{ new Date(f.updatedAt).toLocaleDateString('zh-CN') }}</span>
          </div>
          <div v-if="displayItems.length === 0 && folders.length === 0" class="fp-empty">暂无文本文件</div>
        </template>
      </div>
    </template>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.show" class="fp-ctx-overlay" @click="closeContextMenu">
        <div class="fp-ctx-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
          <!-- 文件夹菜单 -->
          <template v-if="contextMenu.file?.mimeType === 'folder'">
            <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
            <button class="fp-ctx-item" @click="openFolder(contextMenu.file!); closeContextMenu()"><span class="mso">folder_open</span> 打开</button>
            <button class="fp-ctx-item danger" @click="deleteFolderItem"><span class="mso">delete</span> 删除</button>
          </template>
          <!-- 图片/视频菜单 -->
          <template v-else-if="activeTab === 'image' || activeTab === 'video'">
            <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
            <button class="fp-ctx-item" @click="referenceFile"><span class="mso">link</span> 引用</button>
            <button class="fp-ctx-item" @click="importToCreation"><span class="mso">photo_camera</span> 导入创作面板</button>
            <button class="fp-ctx-item danger" @click="deleteFile"><span class="mso">delete</span> 删除</button>
          </template>
          <!-- 文本菜单 -->
          <template v-else>
            <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
            <button class="fp-ctx-item" @click="referenceFile"><span class="mso">link</span> 引用</button>
            <button class="fp-ctx-item" @click="openInEditor"><span class="mso">edit_note</span> 在编辑区打开</button>
            <button class="fp-ctx-item danger" @click="deleteFile"><span class="mso">delete</span> 删除</button>
          </template>
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
/* 面包屑 */
.fp-breadcrumb { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); background: var(--surface); }
.fp-bread-btn { display: flex; align-items: center; gap: 2px; border: none; background: none; color: var(--olive); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.fp-bread-name { font-size: 12px; font-weight: 600; color: var(--ink1); }
/* 文件夹 */
.fp-item.folder { background: rgba(255,152,0,.04); }
.fp-item.folder:hover { background: rgba(255,152,0,.08); }
/* 选中状态 */
.fp-item.selected, .fp-media-item.selected { background: rgba(107,142,35,.08); border-radius: 6px; }
.fp-media-item.selected .fp-media-thumb { border-color: var(--olive); }
</style>
