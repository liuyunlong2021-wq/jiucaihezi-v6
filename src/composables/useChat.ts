/**
 * composables/useChat.ts — 聊天核心逻辑
 * 源自 code.html:
 *   - streamChat() 行 10228-10461
 *   - sendMessage() 行 9581-9830 (简化版)
 *   - endStream() 行 10462-10484
 *   - SSE parser 行 10392-10441
 */
import { ref } from 'vue'
import { resolveApiConfig, buildHeaders, buildChatErrorMessage, type ApiConfig } from '@/utils/api'
import { recallKnowledge } from '@/composables/useBrain'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  agentId?: string
  agentName?: string
}

// Reactive state
const messages = ref<ChatMessage[]>([])
const isStreaming = ref(false)
const abortController = ref<AbortController | null>(null)

/**
 * 生成消息 ID — 参考 code.html createLocalMessageId()
 */
function createMessageId(role: string): string {
  return role + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

/**
 * SSE 流解析器 — 精确复制自 code.html 行 10392-10441
 * 
 * 读取 ReadableStream, 逐行解析 data: 事件, 提取 delta.content
 */
async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (fullText: string) => void,
  onFinish: (fullText: string, finishReason: string) => void,
  onError: (err: Error) => void
) {
  const decoder = new TextDecoder()
  let buffer = ''
  let fullReply = ''
  let finishReason = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onFinish(fullReply, finishReason)
        return
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      // 行 10422-10436: SSE line parser
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const j = JSON.parse(data)
          finishReason = j.choices?.[0]?.finish_reason || finishReason
          const delta = j.choices?.[0]?.delta?.content || ''
          if (delta) {
            fullReply += delta
            onDelta(fullReply)
          }
        } catch {}
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      onError(new Error('⚠️ 生成已手动停止'))
    } else {
      onError(err as Error)
    }
  }
}

/**
 * useChat — 核心 composable
 */
export function useChat() {
  /**
   * 发送消息并获取流式回复
   * 精确复制自 code.html streamChat() 行 10228-10461 的核心逻辑
   */
  async function sendMessage(
    userText: string,
    options: {
      systemPrompt?: string
      agentId?: string
      agentName?: string
    } = {}
  ) {
    if (!userText.trim() || isStreaming.value) return
    
    // 1. 解析 API 配置 (行 10230-10233)
    let config: ApiConfig
    try {
      config = await resolveApiConfig()
    } catch (err) {
      messages.value.push({
        id: createMessageId('assistant'),
        role: 'assistant',
        content: (err as Error).message,
        timestamp: Date.now(),
      })
      return
    }

    if (!config.apiKey) {
      messages.value.push({
        id: createMessageId('assistant'),
        role: 'assistant',
        content: '⚠️ 未检测到 API Key，请点击左下角设置。',
        timestamp: Date.now(),
      })
      return
    }

    // 2. 添加用户消息
    const userMsg: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: userText.trim(),
      timestamp: Date.now(),
      agentId: options.agentId,
    }
    messages.value.push(userMsg)

    // 3. 知识回忆 — 自动匹配知识库注入上下文（移植自 V4 行 17918）
    let systemPrompt = options.systemPrompt || '你是韭菜盒子的AI助手，请用中文回复。'
    const recalled = recallKnowledge(userText, options.agentId)
    if (recalled) {
      systemPrompt += recalled
    }

    // 4. 构建 OpenAI 格式消息 (行 10261)
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.value
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }))
    ]

    // 4. 准备 AI 回复占位 (行 10304-10312)
    const aiMsg: ChatMessage = {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      agentId: options.agentId,
      agentName: options.agentName,
    }
    messages.value.push(aiMsg)
    const aiMsgIndex = messages.value.length - 1

    // 5. 开始流式请求 (行 10283, 10378-10383)
    isStreaming.value = true
    abortController.value = new AbortController()
    const headers = buildHeaders(config)

    try {
      const res = await fetch(config.apiBase + '/v1/chat/completions', {
        method: 'POST',
        signal: abortController.value.signal,
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: apiMessages,
          max_tokens: 4096,
          stream: true,
        }),
      })

      // 错误处理 (行 10385-10389)
      if (!res.ok) {
        const raw = await res.text()
        let parsed = null
        try { parsed = raw ? JSON.parse(raw) : null } catch {}
        const errMsg = buildChatErrorMessage(res.status, parsed, raw || res.statusText || '请求失败')
        messages.value[aiMsgIndex].content = errMsg
        isStreaming.value = false
        abortController.value = null
        return
      }

      // 6. 读取 SSE 流 (行 10392-10441)
      const reader = res.body!.getReader()
      await readSSEStream(
        reader,
        // onDelta — 实时更新消息 (行 10429-10434)
        (fullText) => {
          messages.value[aiMsgIndex].content = fullText
        },
        // onFinish (行 10327-10375 简化)
        (fullText) => {
          messages.value[aiMsgIndex].content = fullText
          isStreaming.value = false
          abortController.value = null
        },
        // onError (行 10444-10460)
        (err) => {
          if (messages.value[aiMsgIndex].content) {
            messages.value[aiMsgIndex].content += '\n\n⚠️ 中断：' + err.message
          } else {
            messages.value[aiMsgIndex].content = '⚠️ ' + err.message
          }
          isStreaming.value = false
          abortController.value = null
        }
      )
    } catch (err) {
      // 行 10444-10460
      const errMsg = (err as Error).name === 'AbortError'
        ? '⚠️ 生成已手动停止'
        : '⚠️ ' + (err as Error).message
      messages.value[aiMsgIndex].content = errMsg
      isStreaming.value = false
      abortController.value = null
    }
  }

  /** 停止生成 — 行 10283 */
  function stopStream() {
    abortController.value?.abort()
    abortController.value = null
    isStreaming.value = false
  }

  /** 清空消息 */
  function clearMessages() {
    messages.value = []
  }

  /** 加载历史消息 */
  function loadMessages(history: ChatMessage[]) {
    messages.value = history
  }

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStream,
    clearMessages,
    loadMessages,
  }
}
