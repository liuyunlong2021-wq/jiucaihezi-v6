/**
 * stores/sessionStore.ts — 对话历史管理 Store
 * 源自 code.html:
 *   - Chat History V3 (行 4809-4940)
 *   - saveChatHistory / loadChatHistory
 *   - buildConversationTitleFromMessages (行 4868-4881)
 *   - createConversationSessionId (行 4859-4861)
 *   - syncChatToCloud (行 2183-2208)
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as idb from '@/utils/idb'
import type { ChatMessage } from '@/composables/useChat'

export interface Session {
  id: string
  title: string
  agentId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export const useSessionStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string>('')

  // ─── createConversationSessionId — 行 4859-4861 ───
  function createSessionId(): string {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
  }

  // ─── buildConversationTitleFromMessages — 行 4868-4881 ───
  function buildTitle(messages: ChatMessage[], fallback?: string): string {
    const list = Array.isArray(messages) ? messages : []
    // 先找用户消息
    for (const item of list) {
      const content = String(item?.content || '').replace(/[\n\r]/g, ' ').trim()
      if (content && item.role === 'user') return content.substring(0, 50)
    }
    // 再找任意消息
    for (const item of list) {
      const content = String(item?.content || '').replace(/[\n\r]/g, ' ').trim()
      if (content) return content.substring(0, 50)
    }
    return String(fallback || '无主题对话')
  }

  // ─── 保存当前对话到 IndexedDB ───
  async function saveSession(
    sessionId: string,
    agentId: string,
    messages: ChatMessage[]
  ) {
    if (!messages.length) return

    const title = buildTitle(messages)
    const now = Date.now()

    // 保存 conversation 元数据
    const convRecord = {
      id: sessionId,
      scopeKey: agentId || 'direct',
      sessionId,
      title,
      kind: 'active',
      agentId: agentId || '',
      createdAt: now,
      updatedAt: now,
    }
    await idb.setRecord('conversations', convRecord)

    // 保存消息
    const msgRecord = {
      id: sessionId,
      conversationId: sessionId,
      items: messages.map(m => ({ ...m })),
      updatedAt: now,
    }
    await idb.setRecord('messages', msgRecord)

    // 更新内存列表
    const existingIdx = sessions.value.findIndex(s => s.id === sessionId)
    const sessionMeta: Session = {
      id: sessionId,
      title,
      agentId: agentId || '',
      createdAt: existingIdx >= 0 ? sessions.value[existingIdx].createdAt : now,
      updatedAt: now,
      messageCount: messages.length,
    }
    if (existingIdx >= 0) {
      sessions.value[existingIdx] = sessionMeta
    } else {
      sessions.value.unshift(sessionMeta)
    }
  }

  // ─── 加载对话消息 ───
  async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const record = await idb.getRecord('messages', sessionId)
    if (record && Array.isArray(record.items)) {
      return record.items
    }
    return []
  }

  // ─── 加载所有对话列表 ───
  async function loadAllSessions() {
    const records = await idb.getAll('conversations')
    sessions.value = records
      .filter((r: any) => r && r.id)
      .map((r: any) => ({
        id: r.id,
        title: r.title || '无主题对话',
        agentId: r.agentId || r.scopeKey || '',
        createdAt: r.createdAt || 0,
        updatedAt: r.updatedAt || 0,
        messageCount: 0,
      }))
      .sort((a: Session, b: Session) => b.updatedAt - a.updatedAt)
  }

  // ─── 新建对话 ───
  function startNewSession(agentId: string): string {
    const id = createSessionId()
    activeSessionId.value = id
    return id
  }

  // ─── 切换对话 ───
  function switchSession(sessionId: string) {
    activeSessionId.value = sessionId
  }

  // ─── 删除对话 ───
  async function deleteSession(sessionId: string) {
    await idb.removeRecord('conversations', sessionId)
    await idb.removeRecord('messages', sessionId)
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = ''
    }
  }

  return {
    sessions,
    activeSessionId,
    createSessionId,
    buildTitle,
    saveSession,
    loadSessionMessages,
    loadAllSessions,
    startNewSession,
    switchSession,
    deleteSession,
  }
})
