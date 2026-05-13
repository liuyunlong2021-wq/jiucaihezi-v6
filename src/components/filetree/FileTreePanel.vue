<script setup lang="ts">
/**
 * FileTreePanel — 文件面板（Col 2）
 * 5个tab：文本、图片、视频、知识库、搭子
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useFileStore, type FileEntry } from '@/composables/useFileStore'
import { useAgentStore } from '@/stores/agentStore'
import { emitEvent, onEvent } from '@/utils/eventBus'
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
  if (currentFolder.value) {
    const latestFolder = items.value.find(f => f.id === currentFolder.value?.id)
    currentFolder.value = latestFolder || null
  }
}

onMounted(() => {
  loadTab()
})

// ─── 编辑状态同步 ───
const activeEditingId = ref<string | null>(null)
const offEditorChanged = onEvent('editor-file-changed', (payload: any) => {
  activeEditingId.value = payload?.fileId || null
})
const offRefreshList = onEvent('refresh-file-list', () => {
  loadTab()
})
onBeforeUnmount(() => {
  offEditorChanged()
  offRefreshList()
})

function switchTab(tab: Tab) {
  activeTab.value = tab
  currentFolder.value = null
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
    selectedIds.value = new Set(displayFiles.value.map(f => f.id))
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
    await deleteFileAndDetach(id)
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

// ─── 空白处右键菜单 ───
const blankContextMenu = ref({ show: false, x: 0, y: 0 })
function openBlankContextMenu(e: MouseEvent) {
  e.preventDefault()
  // 只有点击空白处时才触发（排除点击具体 item）
  const target = e.target as HTMLElement
  if (target.closest('.fp-item') || target.closest('.fp-media-item') || target.closest('.fp-toolbar') || target.closest('.fp-tabs')) return
  blankContextMenu.value = { show: true, x: e.clientX, y: e.clientY }
}
function closeBlankContextMenu() { blankContextMenu.value.show = false }

// ─── 文件右键菜单 ───
function openContextMenu(e: MouseEvent, file: FileEntry) {
  e.preventDefault()
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, file }
}
function closeContextMenu() { contextMenu.value.show = false }

// 点击外部关闭所有菜单
function closeAllMenus() {
  closeContextMenu()
  closeSkillMenu()
  closeBlankContextMenu()
}

async function renameFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  const newName = prompt('重命名', f.name)
  if (newName && newName !== f.name) {
    await fileStore.updateFile(f.id, { name: newName })
    emitEvent('file-renamed', { oldName: f.name, newName })
    await loadTab()
  }
}
function referenceFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) emitEvent('reference-file', { name: f.name, content: f.content })
}
function openInEditor() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  emitEvent('open-in-editor', { name: f.name, content: f.content, fileId: f.id })
  emitEvent('switch-panel', 'editor')
}

// ─── 知识库在编辑区打开 ───
function openKnowledgeInEditor(f: FileEntry) {
  emitEvent('open-in-editor', { name: f.name, content: f.content, fileId: f.id })
  emitEvent('switch-panel', 'editor')
}

// ─── 知识库右键菜单编辑 ───
function editKnowledgeTopic() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  const newTopic = prompt('修改知识主题 (Topic)', f.topic || '')
  if (newTopic !== null && newTopic !== f.topic) {
    fileStore.updateFile(f.id, { topic: newTopic }).then(loadTab)
  }
}

// ─── 打开长脑子面板 ───
function openBrainPanel() {
  emitEvent('switch-panel', 'brain')
}

// ─── 空白处新建操作 ───
async function createNewFolder() {
  const name = prompt('文件夹名称', '新文件夹')
  if (name) await fileStore.addFile({ category: activeTab.value, name, content: '', mimeType: 'folder', size: 0, metadata: { isFolder: true, children: [] } })
  await loadTab()
  closeBlankContextMenu()
}

function createNewAgent() {
  const name = prompt('搭子名称', '新搭子')
  if (name) {
    const skill = { id: 'skill_' + Date.now().toString(36), name, description: '', oneLineDesc: '', triggers: [], skillContent: '', references: [], examples: [], version: 1, source: 'user' as const, createdAt: Date.now(), updatedAt: Date.now(), evolutionLog: [] }
    agentStore.createAgent(skill)
    agentStore.moveToMy(skill.id)
  }
  closeBlankContextMenu()
}

function createNewKnowledge() {
  const name = prompt('知识主题', '新知识点')
  if (name) {
    fileStore.addKnowledge({ name, content: '在此编辑知识内容...', topic: '通用', indexed: true }).then(f => openKnowledgeInEditor(f))
  }
  closeBlankContextMenu()
}

// ─── 新建文本文档 ───
async function createNewDoc() {
  const name = prompt('文档名称', `新文档_${new Date().toLocaleTimeString('zh-CN')}`)
  if (!name) return
  const file = await fileStore.addText(name, '')
  await loadTab()
  // 自动在编辑区打开
  emitEvent('open-in-editor', { name: file.name, content: '', fileId: file.id })
  emitEvent('switch-panel', 'editor')
}

// ─── 右键菜单增强 ───
function copyFileContent() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) navigator.clipboard.writeText(f.content).then(() => alert('已复制到剪贴板'))
}

function appendToEditor() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) {
    emitEvent('import-to-editor', { content: f.content, agentName: f.name })
    emitEvent('switch-panel', 'editor')
  }
}

function sendToAgent() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) {
    emitEvent('send-to-chat', { text: f.content })
  }
}

function exportSingleFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  const blob = new Blob([f.content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.name.replace(/[/\\:*?"<>|]/g, '_') + '.md'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 底部快捷操作 ───
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (!text.trim()) { alert('剪贴板为空'); return }
    const name = `粘贴_${new Date().toLocaleTimeString('zh-CN')}`
    const file = await fileStore.addText(name, text)
    await loadTab()
    emitEvent('open-in-editor', { name: file.name, content: text, fileId: file.id })
    emitEvent('switch-panel', 'editor')
  } catch { alert('无法读取剪贴板') }
}

async function exportAllTexts() {
  const files = await fileStore.loadByCategory('text')
  if (files.length === 0) { alert('没有文本文件'); return }
  const combined = files.map(f => `# ${f.name}\n\n${f.content}`).join('\n\n---\n\n')
  const blob = new Blob([combined], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `全部文本_${new Date().toLocaleDateString('zh-CN')}.md`
  a.click()
  URL.revokeObjectURL(url)
}
async function deleteFile() {
  const f = contextMenu.value.file; closeContextMenu()
  if (f) { await deleteFileAndDetach(f.id); await loadTab() }
}

async function knowledgeBackup() {
  const entries = await fileStore.loadByCategory('knowledge')
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  // 优先使用 File System Access API 让用户选目录
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({ suggestedName: `知识库备份_${new Date().toLocaleDateString('zh-CN')}.json`, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch { /* 用户取消或不支持，走 fallback */ }
  }
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
    // 结构验证：必须是数组且每项有 category=knowledge
    if (!Array.isArray(entries) || entries.length === 0) { alert('文件内容为空或格式不正确'); return }
    const valid = entries.filter(e => e.category === 'knowledge' && e.name && e.content)
    if (valid.length === 0) { alert('文件结构不匹配：未找到知识库条目（需要 category="knowledge"）'); return }
    for (const entry of valid) {
      await fileStore.addKnowledge({ name: entry.name, content: entry.content, topic: entry.topic, skillId: entry.skillId, indexed: entry.indexed })
    }
    alert(`成功合并 ${valid.length} 条知识`)
    await loadTab()
  } catch { alert('文件格式不正确，请选择相同结构的知识库备份文件') }
  input.value = ''
}

// ─── 合并所选（合并为文件夹） ───
async function mergeSelected() {
  if (selectedIds.value.size < 2) return
  if (activeTab.value === 'knowledge' || activeTab.value === 'skill') return
  const folderName = prompt('文件夹名称', '新文件夹')
  if (!folderName) return
  // 创建文件夹记录
  const folder = await fileStore.addFile({
    category: activeTab.value as FileEntry['category'],
    name: folderName,
    content: '',
    mimeType: 'folder',
    size: 0,
    metadata: { isFolder: true, children: Array.from(selectedIds.value) },
  })
  // 将选中文件标记为属于该文件夹
  for (const id of selectedIds.value) {
    await fileStore.updateFile(id, { folderId: folder.id })
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

// ─── 搭子右键菜单 ───
const skillMenu = ref({ show: false, x: 0, y: 0, skill: null as any })
function openSkillMenu(e: MouseEvent, skill: any) {
  e.preventDefault()
  skillMenu.value = { show: true, x: e.clientX, y: e.clientY, skill }
}
function closeSkillMenu() { skillMenu.value.show = false }
function renameSkill() {
  const s = skillMenu.value.skill; closeSkillMenu()
  if (!s) return
  const newName = prompt('重命名搭子', s.name)
  if (newName && newName !== s.name) agentStore.updateSkill(s.id, { name: newName })
}
function referenceSkill() {
  const s = skillMenu.value.skill; closeSkillMenu()
  if (s) emitEvent('reference-file', { name: s.name, content: s.skillContent || s.description })
}
function openSkillInEditor() {
  const s = skillMenu.value.skill; closeSkillMenu()
  if (!s) return
  emitEvent('open-in-editor', { name: s.name, content: s.skillContent || '' })
  emitEvent('switch-panel', 'editor')
}
function openSkillDetail(skill: any) {
  if (!skill) return
  emitEvent('open-in-editor', { name: skill.name, content: skill.skillContent || skill.description || '' })
  emitEvent('switch-panel', 'editor')
}
function deleteSkill() {
  const s = skillMenu.value.skill; closeSkillMenu()
  if (!s) return
  if (!confirm(`确定删除搭子「${s.name}」？`)) return
  agentStore.deleteAgent(s.id)
}

// ─── 搭子单文件上传 ───
async function handleSkillTextUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.[0]) return
  const file = input.files[0]
  const text = await file.text()
  if (!text.includes('name:') && !text.match(/^---/)) {
    alert('文件不是有效的 SKILL.md 格式'); return
  }
  const parsed = parseSkillMd(text)
  if (!parsed.name && !parsed.skillContent) { alert('无法解析 SKILL.md'); return }
  const skill = {
    id: 'upload_' + Date.now().toString(36),
    name: parsed.name || '导入搭子',
    description: parsed.description || '',
    oneLineDesc: parsed.description || '',
    triggers: parsed.triggers || [],
    skillContent: parsed.skillContent || text,
    references: [], examples: [], version: 1,
    source: 'user' as const, createdAt: Date.now(), updatedAt: Date.now(), evolutionLog: [],
  }
  agentStore.createAgent(skill)
  agentStore.moveToMy(skill.id)
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

async function deleteFolderItem() {
  const f = contextMenu.value.file; closeContextMenu()
  if (!f) return
  if (f.mimeType === 'folder') {
    if (!confirm(`确定删除文件夹「${f.name}」及其所有内容？`)) return
    const children = (f.metadata?.children as string[]) || []
    for (const cid of children) { await fileStore.deleteFile(cid) }
  } else {
    await detachFromFolder(f.id)
  }
  await fileStore.deleteFile(f.id)
  if (currentFolder.value?.id === f.id) currentFolder.value = null
  await loadTab()
}

async function detachFromFolder(fileId: string) {
  const all = await fileStore.loadByCategory(activeTab.value)
  const parents = all.filter(f => {
    const children = (f.metadata?.children as string[]) || []
    return f.mimeType === 'folder' && children.includes(fileId)
  })
  for (const parent of parents) {
    const children = ((parent.metadata?.children as string[]) || []).filter(id => id !== fileId)
    await fileStore.updateFile(parent.id, {
      metadata: { ...(parent.metadata || {}), children },
    })
  }
}

async function deleteFileAndDetach(fileId: string) {
  await detachFromFolder(fileId)
  await fileStore.deleteFile(fileId)
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
  if (currentFolder.value) return []
  return filteredItems.value.filter(f => f.mimeType === 'folder')
})

const displayFiles = computed(() => {
  return displayItems.value.filter(f => f.mimeType !== 'folder')
})
</script>

<template>
  <div class="fp" @click="closeAllMenus" @contextmenu="openBlankContextMenu">
    <div class="fp-tabs">
      <button v-for="t in tabItems" :key="t.key" class="fp-tab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key as Tab)">
        <span class="mso" style="font-size:14px">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </button>
      <button class="fp-tab" style="margin-left: auto; padding: 5px 8px" @click="emitEvent('toggle-file-tree')" title="收起文件面板">
        <span class="mso">keyboard_double_arrow_left</span>
      </button>
    </div>

    <template v-if="activeTab === 'knowledge'">
      <div class="fp-knowledge">
        <div class="fp-knowledge-info">
          <span class="mso" style="font-size:32px;color:var(--olive)">psychology</span>
          <div class="fp-knowledge-count">{{ items.length }} 条知识</div>
        </div>
        <div class="fp-knowledge-actions">
          <button class="fp-kb-btn brain-btn" @click="openBrainPanel"><span class="mso">psychology</span> 唤起长脑子</button>
          <label class="fp-kb-btn"><span class="mso">merge</span> 合并<input type="file" accept=".json" @change="knowledgeMerge" hidden /></label>
          <button class="fp-kb-btn" @click="knowledgeBackup"><span class="mso">download</span> 备份</button>
          <button class="fp-kb-btn danger" @click="knowledgeDelete"><span class="mso">delete</span> 删除</button>
        </div>
        <div class="fp-list">
          <div v-for="f in items" :key="f.id" class="fp-item"
               :class="{ selected: selectedIds.has(f.id), editing: f.id === activeEditingId }"
               @dblclick="openKnowledgeInEditor(f)"
               @contextmenu.stop="openContextMenu($event, f)">
            <span class="mso" style="font-size:16px;color:var(--olive)">auto_stories</span>
            <span class="fp-item-name">{{ f.name }}</span>
            <span v-if="f.id === activeEditingId" class="fp-editing-dot" title="正在编辑中"></span>
            <span class="fp-item-meta">{{ f.topic || '通用' }}</span>
          </div>
          <div v-if="items.length === 0" class="fp-empty">知识库为空，开启整理后自动积累</div>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- 工具栏 -->
      <div class="fp-toolbar">
        <div class="fp-search"><span class="mso" style="font-size:14px">search</span><input v-model="searchQuery" placeholder="搜索..." /></div>
        <button v-if="activeTab === 'text'" class="fp-tool-btn new-doc" @click="createNewDoc" title="新建文本">
          <span class="mso">note_add</span>
        </button>
        <button class="fp-tool-btn" :class="{ active: selectAll }" @click="toggleSelectAll" title="全选"><span class="mso">select_all</span></button>
        <button class="fp-tool-btn" :disabled="!selectAll || selectedIds.size === 0" @click="deleteSelected" title="删除所选"><span class="mso">delete</span></button>
        <button v-if="activeTab === 'text' || activeTab === 'image' || activeTab === 'video'" class="fp-tool-btn" :disabled="!selectAll || selectedIds.size < 2" @click="mergeSelected" title="合并所选"><span class="mso">create_new_folder</span></button>
        <label v-if="activeTab === 'skill'" class="fp-tool-btn" title="上传搭子单文件">
          <span class="mso">upload_file</span>
          <input type="file" accept=".md" @change="handleSkillTextUpload" hidden />
        </label>
        <label v-if="activeTab === 'skill'" class="fp-tool-btn" title="上传搭子文件夹">
          <span class="mso">drive_folder_upload</span>
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
          <div v-for="s in agentStore.getMySkills()" :key="s.id" class="fp-item skill"
               @dblclick="openSkillDetail(s)"
               @contextmenu="openSkillMenu($event, s)">
            <span class="mso" style="font-size:16px;color:var(--olive)">smart_toy</span>
            <span class="fp-item-name">{{ s.name }}</span>
            <span class="fp-item-meta">{{ s.triggers?.slice(0,2).join(', ') }}</span>
          </div>
          <div v-if="agentStore.getMySkills().length === 0" class="fp-empty">还没有搭子</div>
        </template>

        <!-- 图片/视频 tab -->
        <template v-else-if="activeTab === 'image' || activeTab === 'video'">
          <div v-for="f in folders" :key="f.id" class="fp-item folder" @dblclick="openFolder(f)" @contextmenu="openContextMenu($event, f)">
            <span class="mso" style="font-size:16px;color:#ff9800">folder</span>
            <span class="fp-item-name">{{ f.name }}</span>
            <span class="fp-item-meta">{{ ((f.metadata?.children as string[]) || []).length }} 个文件</span>
          </div>
          <div class="fp-media-grid">
            <div v-for="f in displayFiles" :key="f.id" class="fp-media-item"
                 :class="{ selected: selectedIds.has(f.id) }"
                 @click="selectAll ? toggleItem(f.id) : null"
                 @contextmenu="openContextMenu($event, f)">
              <img v-if="activeTab === 'image'" :src="f.content" class="fp-media-thumb" />
              <div v-else class="fp-media-thumb video"><span class="mso">movie</span></div>
              <span class="fp-media-name">{{ f.name }}</span>
            </div>
          </div>
          <div v-if="displayFiles.length === 0 && folders.length === 0" class="fp-empty">暂无{{ activeTab === 'image' ? '图片' : '视频' }}</div>
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
          <div v-for="f in displayFiles" :key="f.id" class="fp-item"
               :class="{ selected: selectedIds.has(f.id), editing: f.id === activeEditingId }"
               @click="selectAll ? toggleItem(f.id) : null"
               @dblclick="!selectAll ? (() => { emitEvent('open-in-editor', { name: f.name, content: f.content, fileId: f.id }); emitEvent('switch-panel', 'editor') })() : null"
               @contextmenu="openContextMenu($event, f)">
            <input v-if="selectAll" type="checkbox" :checked="selectedIds.has(f.id)" @click.stop="toggleItem(f.id)" />
            <span class="mso" style="font-size:16px;color:var(--ink3)">description</span>
            <span class="fp-item-name">{{ f.name }}</span>
            <span v-if="f.id === activeEditingId" class="fp-editing-dot" title="正在编辑中"></span>
            <span class="fp-item-meta">{{ new Date(f.updatedAt).toLocaleDateString('zh-CN') }}</span>
          </div>
          <div v-if="displayFiles.length === 0 && folders.length === 0" class="fp-empty">暂无文本文件</div>
        </template>
      </div>

      <!-- 底部快捷操作条（仅文本 Tab） -->
      <div v-if="activeTab === 'text'" class="fp-quick-bar">
        <button class="fp-quick-btn" @click="createNewDoc">
          <span class="mso">add</span> 新建文档
        </button>
        <button class="fp-quick-btn" @click="pasteFromClipboard">
          <span class="mso">content_paste</span> 粘贴创建
        </button>
        <button class="fp-quick-btn" @click="exportAllTexts">
          <span class="mso">download</span> 导出全部
        </button>
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
          <!-- 知识库菜单 -->
          <template v-else-if="activeTab === 'knowledge'">
            <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
            <button class="fp-ctx-item" @click="editKnowledgeTopic"><span class="mso">label</span> 修改主题</button>
            <button class="fp-ctx-item" @click="openInEditor"><span class="mso">edit_note</span> 在编辑区打开</button>
            <button class="fp-ctx-item danger" @click="deleteFile"><span class="mso">delete</span> 删除此条知识</button>
          </template>
          <!-- 文本菜单 -->
          <template v-else>
            <button class="fp-ctx-item" @click="renameFile"><span class="mso">edit</span> 重命名</button>
            <button class="fp-ctx-item" @click="openInEditor"><span class="mso">edit_note</span> 在编辑区打开</button>
            <button class="fp-ctx-item" @click="appendToEditor"><span class="mso">playlist_add</span> 追加到编辑区</button>
            <button class="fp-ctx-item" @click="referenceFile"><span class="mso">link</span> 引用到聊天</button>
            <button class="fp-ctx-item" @click="copyFileContent"><span class="mso">content_copy</span> 复制内容</button>
            <button class="fp-ctx-item" @click="sendToAgent"><span class="mso">send</span> 发送给搭子</button>
            <button class="fp-ctx-item" @click="exportSingleFile"><span class="mso">download</span> 导出 .md</button>
            <button class="fp-ctx-item danger" @click="deleteFile"><span class="mso">delete</span> 删除</button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 搭子专属右键菜单 -->
    <Teleport to="body">
      <div v-if="skillMenu.show" class="fp-ctx-overlay" @click="closeSkillMenu">
        <div class="fp-ctx-menu" :style="{ top: skillMenu.y + 'px', left: skillMenu.x + 'px' }">
          <button class="fp-ctx-item" @click="renameSkill"><span class="mso">edit</span> 重命名</button>
          <button class="fp-ctx-item" @click="referenceSkill"><span class="mso">link</span> 引用</button>
          <button class="fp-ctx-item" @click="openSkillInEditor"><span class="mso">edit_note</span> 在编辑区打开</button>
          <button class="fp-ctx-item danger" @click="deleteSkill"><span class="mso">delete</span> 删除</button>
        </div>
      </div>
    </Teleport>

    <!-- 空白处全局右键菜单 -->
    <Teleport to="body">
      <div v-if="blankContextMenu.show" class="fp-ctx-overlay" @click="closeBlankContextMenu" @contextmenu.prevent="closeBlankContextMenu">
        <div class="fp-ctx-menu" :style="{ top: blankContextMenu.y + 'px', left: blankContextMenu.x + 'px' }">
          <button class="fp-ctx-item" @click="loadTab(); closeBlankContextMenu()"><span class="mso">refresh</span> 刷新列表</button>
          
          <template v-if="activeTab === 'text'">
            <button class="fp-ctx-item" @click="createNewDoc(); closeBlankContextMenu()"><span class="mso">note_add</span> 新建文本文档</button>
            <button class="fp-ctx-item" @click="pasteFromClipboard(); closeBlankContextMenu()"><span class="mso">content_paste</span> 从剪贴板粘贴新建</button>
            <!-- 触发原生上传按钮 -->
            <label class="fp-ctx-item" style="cursor: pointer;">
              <span class="mso">upload</span> 上传文本文件
              <input type="file" multiple @change="handleUpload" hidden />
            </label>
          </template>

          <template v-else-if="activeTab === 'image' || activeTab === 'video'">
            <label class="fp-ctx-item" style="cursor: pointer;">
              <span class="mso">upload</span> 上传媒体文件
              <input type="file" multiple @change="handleUpload" hidden />
            </label>
            <button class="fp-ctx-item" @click="createNewFolder"><span class="mso">create_new_folder</span> 新建空文件夹</button>
          </template>

          <template v-else-if="activeTab === 'skill'">
            <button class="fp-ctx-item" @click="createNewAgent"><span class="mso">smart_toy</span> 新建空搭子</button>
            <label class="fp-ctx-item" style="cursor: pointer;">
              <span class="mso">upload_file</span> 上传 SKILL.md
              <input type="file" accept=".md" @change="handleSkillTextUpload" hidden />
            </label>
          </template>

          <template v-else-if="activeTab === 'knowledge'">
            <button class="fp-ctx-item" @click="openBrainPanel(); closeBlankContextMenu()"><span class="mso">psychology</span> 唤起长脑子</button>
            <button class="fp-ctx-item" @click="createNewKnowledge"><span class="mso">add_circle</span> 手动新建知识点</button>
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
.fp-kb-btn.brain-btn { background: rgba(107,142,35,.1); color: var(--olive); border-color: var(--olive); }
.fp-kb-btn.brain-btn:hover { background: rgba(107,142,35,.2); }
.fp-kb-btn .mso { font-size: 15px; }
.fp-ctx-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.1); }
.fp-ctx-menu { position: fixed; min-width: 160px; padding: 8px; background: #fff; border: 2px solid #ddd; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.25); z-index: 10000; }
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

/* 正在编辑标记 */
.fp-item.editing { background: rgba(107,142,35,.06); border-left: 2px solid var(--olive); }
.fp-editing-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4caf50; flex-shrink: 0;
  box-shadow: 0 0 4px rgba(76,175,80,.5);
  animation: dot-pulse 2s ease infinite;
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .4; }
}

/* 新建文档按钮 */
.fp-tool-btn.new-doc { background: var(--olive); color: #fff; border-color: var(--olive); }
.fp-tool-btn.new-doc:hover { background: var(--olive-dark); }

/* 底部快捷操作条 */
.fp-quick-bar {
  display: flex; gap: 4px; padding: 8px 6px;
  border-top: 1px solid var(--line);
  background: var(--surface-alt); flex-shrink: 0;
}
.fp-quick-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 3px;
  padding: 6px 4px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--surface); color: var(--ink2);
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all .12s;
}
.fp-quick-btn:hover { border-color: var(--olive); color: var(--olive); }
.fp-quick-btn .mso { font-size: 14px; }
</style>
