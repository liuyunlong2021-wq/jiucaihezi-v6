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
    return file
  }

  async function updateFile(id: string, patch: Partial<FileEntry>) {
    const existing = await getRecord(STORE, id) as FileEntry | undefined
    if (!existing) return
    const updated = { ...existing, ...patch, updatedAt: Date.now() }
    await setRecord(STORE, updated)
  }

  async function deleteFile(id: string) {
    await removeRecord(STORE, id)
  }

  async function deleteByCategory(category: FileEntry['category']) {
    const all = await loadByCategory(category)
    for (const f of all) {
      await removeRecord(STORE, f.id)
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
