/**
 * useFileStore.ts — 统一文件存储层（IndexedDB documents store）
 *
 * 所有文件（文本、图片、视频、知识库、搭子）统一存储，用 category 区分。
 */
import { ref } from 'vue'
import { getAll, setRecord, removeRecord, getRecord } from '@/utils/idb'

export interface FileEntry {
  id: string
  category: 'text' | 'image' | 'video' | 'knowledge' | 'skill'
  name: string
  content: string
  mimeType: string
  size: number
  createdAt: number
  updatedAt: number
  folderId?: string
  skillId?: string
  indexed?: boolean
  topic?: string
  metadata?: Record<string, unknown>
}

const STORE = 'documents'
const BRAIN_WIKI_KEY = 'jc_brain_wiki_v1'
const BRAIN_INDEX_KEY = 'jc_brain_index_v1'
const KNOWLEDGE_MIRROR_PREFIX = 'doc_'
const MAX_MIRRORED_KNOWLEDGE = 250
const MAX_MIRROR_CONTENT_CHARS = 4000

interface BrainWikiMirror {
  id: string
  skillId: string
  title: string
  content: string
  sources: string[]
  updatedAt: number
  topic: string
  seeAlso: string[]
  archived: boolean
  conflicts: string[]
}

function loadBrainWikiMirror(): BrainWikiMirror[] {
  try {
    const raw = localStorage.getItem(BRAIN_WIKI_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveBrainWikiMirror(pages: BrainWikiMirror[]) {
  const active = pages
    .filter(p => p && p.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const trimmed = active.slice(0, MAX_MIRRORED_KNOWLEDGE)
  localStorage.setItem(BRAIN_WIKI_KEY, JSON.stringify(trimmed))
  localStorage.setItem(BRAIN_INDEX_KEY, JSON.stringify(trimmed.map(p => ({
    pageId: p.id,
    title: p.title,
    topic: p.topic || 'general',
    summary: p.content.slice(0, 100),
    updatedAt: p.updatedAt,
  }))))
}

function mirrorKnowledgeToBrain(file: FileEntry) {
  if (file.category !== 'knowledge') return
  try {
    const pages = loadBrainWikiMirror()
    const mirrorId = KNOWLEDGE_MIRROR_PREFIX + file.id
    const page: BrainWikiMirror = {
      id: mirrorId,
      skillId: file.skillId || 'general',
      title: file.name || '知识点',
      content: (file.content || '').slice(0, MAX_MIRROR_CONTENT_CHARS),
      sources: [file.id],
      updatedAt: file.updatedAt || Date.now(),
      topic: file.topic || file.skillId || 'general',
      seeAlso: [],
      archived: false,
      conflicts: [],
    }
    const next = pages.filter(p => p.id !== mirrorId)
    next.push(page)
    saveBrainWikiMirror(next)
  } catch (e) {
    console.warn('[FileStore] 知识镜像同步失败:', e)
  }
}

function removeKnowledgeMirror(fileId: string) {
  try {
    const mirrorId = KNOWLEDGE_MIRROR_PREFIX + fileId
    const next = loadBrainWikiMirror().filter(p => p.id !== mirrorId)
    saveBrainWikiMirror(next)
  } catch (e) {
    console.warn('[FileStore] 知识镜像删除失败:', e)
  }
}

export function useFileStore() {
  const files = ref<FileEntry[]>([])
  const loading = ref(false)

  async function loadAll() {
    loading.value = true
    try {
      const all = await getAll(STORE) as FileEntry[]
      files.value = all.filter(f => f.category)
    } catch { files.value = [] }
    loading.value = false
  }

  async function loadByCategory(category: FileEntry['category']): Promise<FileEntry[]> {
    const all = await getAll(STORE) as FileEntry[]
    return all.filter(f => f.category === category)
  }

  async function loadBySkillId(skillId: string): Promise<FileEntry[]> {
    const all = await getAll(STORE) as FileEntry[]
    return all.filter(f => f.skillId === skillId)
  }

  async function loadUnindexed(): Promise<FileEntry[]> {
    const all = await getAll(STORE) as FileEntry[]
    return all.filter(f => f.category === 'knowledge' && f.indexed === false)
  }

  async function addFile(entry: Omit<FileEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FileEntry> {
    const file: FileEntry = {
      ...entry,
      id: `file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await setRecord(STORE, file)
    if (file.category === 'knowledge') mirrorKnowledgeToBrain(file)
    return file
  }

  async function updateFile(id: string, patch: Partial<FileEntry>) {
    const existing = await getRecord(STORE, id) as FileEntry | undefined
    if (!existing) return
    const updated = { ...existing, ...patch, updatedAt: Date.now() }
    await setRecord(STORE, updated)
    if (updated.category === 'knowledge') mirrorKnowledgeToBrain(updated)
  }

  async function deleteFile(id: string) {
    const existing = await getRecord(STORE, id) as FileEntry | undefined
    await removeRecord(STORE, id)
    if (existing?.category === 'knowledge') removeKnowledgeMirror(id)
  }

  async function deleteByCategory(category: FileEntry['category']) {
    const all = await loadByCategory(category)
    for (const f of all) {
      await deleteFile(f.id)
    }
  }

  async function getFile(id: string): Promise<FileEntry | undefined> {
    return await getRecord(STORE, id) as FileEntry | undefined
  }

  // 快捷方法：添加知识库条目
  async function addKnowledge(opts: {
    name: string
    content: string
    topic?: string
    skillId?: string
    indexed?: boolean
    metadata?: Record<string, unknown>
  }): Promise<FileEntry> {
    return addFile({
      category: 'knowledge',
      name: opts.name,
      content: opts.content,
      mimeType: 'text/plain',
      size: new TextEncoder().encode(opts.content).length,
      topic: opts.topic,
      skillId: opts.skillId,
      indexed: opts.indexed ?? false,
      metadata: opts.metadata,
    })
  }

  // 快捷方法：添加文本文件
  async function addText(name: string, content: string): Promise<FileEntry> {
    return addFile({
      category: 'text',
      name,
      content,
      mimeType: 'text/plain',
      size: new TextEncoder().encode(content).length,
    })
  }

  // 快捷方法：添加媒体文件
  async function addMedia(name: string, url: string, type: 'image' | 'video', mimeType: string): Promise<FileEntry> {
    return addFile({
      category: type,
      name,
      content: url,
      mimeType,
      size: 0,
    })
  }

  return {
    files,
    loading,
    loadAll,
    loadByCategory,
    loadBySkillId,
    loadUnindexed,
    addFile,
    addKnowledge,
    addText,
    addMedia,
    updateFile,
    deleteFile,
    deleteByCategory,
    getFile,
  }
}
