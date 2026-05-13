/**
 * composables/useChat.ts — 聊天核心逻辑（工具调用完全体）
 *
 * 对标 OpenClaw-Admin stores/chat.ts:
 *   - Agent 状态机 (8 态)
 *   - tool_call 解析 + 执行 + 回送闭环
 *   - ToolProgress 实时追踪
 *   - SSE 流式解析
 */
import { ref, computed } from 'vue'
import { resolveApiConfig, buildHeaders, buildChatErrorMessage, type ApiConfig } from '@/utils/api'
import { recallKnowledge } from '@/composables/useBrain'
import { webSearch } from '@/utils/webSearch'

// ─── 类型定义 ───

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  agentId?: string
  agentName?: string
  toolCalls?: ToolCall[]       // AI 请求的工具调用
  toolCallId?: string          // tool result 对应的 call id
  toolName?: string            // tool result 对应的工具名
  images?: string[]            // 图片附件（base64 data URLs）
  files?: Array<{ name: string; content: string }>  // 文本文件附件
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolProgress {
  toolCallId: string
  name: string
  phase: 'start' | 'executing' | 'result'
  args: string
  result: string | null
  isError: boolean
  startedAtMs: number
  finishedAtMs: number | null
}

// Agent 状态机 (对标 OpenClaw AgentPhase)
export type AgentPhase =
  | 'idle'       // 空闲
  | 'sending'    // 发送中
  | 'thinking'   // AI 思考中
  | 'tool'       // 调用工具中
  | 'replying'   // 流式回复中
  | 'done'       // 完成
  | 'error'      // 错误

// ─── 全局响应式状态 ───

const messages = ref<ChatMessage[]>([])
const isStreaming = ref(false)
const abortController = ref<AbortController | null>(null)
let activeRunId = 0

// 联网搜索开关（持久化到 localStorage）
const webSearchEnabled = ref(localStorage.getItem('jc_web_search') === 'true')
const webSearching = ref(false)  // 搜索中状态

// Agent 状态
const agentPhase = ref<AgentPhase>('idle')
const agentDetail = ref('')          // 状态详情文字
const currentToolProgress = ref<ToolProgress | null>(null)
const toolHistory = ref<ToolProgress[]>([])   // 本轮所有工具调用记录

// ─── 内部工具 ───

function createMessageId(role: string): string {
  return role + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

function setPhase(phase: AgentPhase, detail = '') {
  agentPhase.value = phase
  agentDetail.value = detail
}

function beginRun(): number {
  activeRunId += 1
  return activeRunId
}

function invalidateRun() {
  activeRunId += 1
}

function isCurrentRun(runId: number): boolean {
  return runId === activeRunId
}

function findAssistantMessage(runId: number, messageId: string): ChatMessage | null {
  if (!isCurrentRun(runId)) return null
  const msg = messages.value.find(m => m.id === messageId)
  return msg?.role === 'assistant' && msg.id === messageId ? msg : null
}

function updateAssistantMessage(
  runId: number,
  messageId: string,
  update: (message: ChatMessage) => void,
): boolean {
  const msg = findAssistantMessage(runId, messageId)
  if (!msg) return false
  update(msg)
  return true
}

function clearStreamingState() {
  abortController.value = null
  isStreaming.value = false
  setPhase('idle')
  currentToolProgress.value = null
}

function cancelCurrentRun() {
  invalidateRun()
  abortController.value?.abort()
  clearStreamingState()
}

function finishController(runId: number, controller: AbortController) {
  if (!isCurrentRun(runId) || abortController.value !== controller) return
  abortController.value = null
  isStreaming.value = false
}

// ─── 内置工具执行器（小白按钮映射的后端） ───

/**
 * 执行工具调用
 * 当前为模拟执行 — 实际需要对接各 skill handler
 * 后续扩展：注册式 tool handler
 */
async function executeToolCall(call: ToolCall): Promise<string> {
  const name = call.function.name
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch (err) {
    return JSON.stringify({
      status: 'error',
      error: 'INVALID_TOOL_ARGUMENTS_JSON',
      tool: name,
      message: `工具 "${name}" 的参数不是合法 JSON，无法执行。`,
      detail: (err as Error).message,
      arguments: call.function.arguments,
    })
  }

  // 内置工具：搜索
  if (name === 'web_search' || name === 'search') {
    return JSON.stringify({
      status: 'success',
      note: `搜索功能需要后端支持。查询: ${args.query || args.q || ''}`,
    })
  }

  // 内置工具：代码执行
  if (name === 'code_execute' || name === 'run_code') {
    return JSON.stringify({
      status: 'simulated',
      note: '代码执行功能需要沙箱后端支持。',
      code: args.code || '',
    })
  }

  // 内置工具：文件读取
  if (name === 'read_file' || name === 'file_read') {
    return JSON.stringify({
      status: 'simulated',
      note: `文件读取需要后端支持。路径: ${args.path || ''}`,
    })
  }

  // 默认：返回工具不支持
  return JSON.stringify({
    status: 'not_implemented',
    tool: name,
    note: `工具 "${name}" 暂未注册执行器。参数已记录。`,
    args: args,
  })
}

// ─── SSE 流解析器（增强版：解析 tool_calls） ───

interface SSEResult {
  fullText: string
  toolCalls: ToolCall[]
  finishReason: string
}

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (fullText: string) => void,
  onToolCallDelta: (toolCalls: ToolCall[]) => void,
  onFinish: (result: SSEResult) => void,
  onError: (err: Error) => void
) {
  const decoder = new TextDecoder()
  let buffer = ''
  let fullReply = ''
  let finishReason = ''

  // 累积 tool_calls（流式模式下 tool_calls 是分片到达的）
  const toolCallAccum: Map<number, { id: string; name: string; args: string }> = new Map()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        const toolCalls = buildToolCalls(toolCallAccum)
        onFinish({ fullText: fullReply, toolCalls, finishReason })
        return
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const j = JSON.parse(data)
          finishReason = j.choices?.[0]?.finish_reason || finishReason
          const delta = j.choices?.[0]?.delta

          // 文本内容
          if (delta?.content) {
            fullReply += delta.content
            onDelta(fullReply)
          }

          // ★ 关键：解析 tool_calls delta
          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallAccum.has(idx)) {
                toolCallAccum.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  args: '',
                })
              }
              const entry = toolCallAccum.get(idx)!
              if (tc.id) entry.id = tc.id
              if (tc.function?.name) entry.name = tc.function.name
              if (tc.function?.arguments) entry.args += tc.function.arguments
            }
            onToolCallDelta(buildToolCalls(toolCallAccum))
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

function buildToolCalls(accum: Map<number, { id: string; name: string; args: string }>): ToolCall[] {
  return Array.from(accum.values())
    .filter(tc => tc.id && tc.name)
    .map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.args },
    }))
}

// ─── useChat composable ───

export function useChat() {
  /**
   * 发送消息并获取流式回复（含工具调用闭环）
   *
   * 流程:
   *   用户消息 → LLM → tool_calls?
   *     YES → 执行 tool → 回送 result → LLM → tool_calls? → ...
   *     NO  → 最终回复 → 结束
   */
  async function sendMessage(
    userText: string,
    options: {
      systemPrompt?: string
      agentId?: string
      agentName?: string
      images?: string[]  // 图片附件（base64 data URLs）
      files?: Array<{ name: string; content: string }>  // 文本文件附件
    } = {}
  ) {
    const hasAttachments = Boolean(options.images?.length || options.files?.length)
    if ((!userText.trim() && !hasAttachments) || isStreaming.value) return
    const runId = beginRun()

    // 1. 解析 API 配置
    let config: ApiConfig
    try {
      config = await resolveApiConfig()
    } catch (err) {
      if (!isCurrentRun(runId)) return
      messages.value.push({
        id: createMessageId('assistant'),
        role: 'assistant',
        content: (err as Error).message,
        timestamp: Date.now(),
      })
      return
    }

    if (!isCurrentRun(runId)) return

    if (!config.apiKey) {
      messages.value.push({
        id: createMessageId('assistant'),
        role: 'assistant',
        content: '⚠️ 未检测到 API Key，请点击左下角设置。',
        timestamp: Date.now(),
      })
      return
    }

    if (!isCurrentRun(runId)) return

    // 2. 添加用户消息（包含附件）
    const userMsg: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: userText.trim(),
      timestamp: Date.now(),
      agentId: options.agentId,
      images: options.images,
      files: options.files,
    }
    messages.value.push(userMsg)

    // 3. 知识回忆
    let systemPrompt = options.systemPrompt || '你是韭菜盒子的AI助手，请用中文回复。'
    const recalled = recallKnowledge(userText, options.agentId)
    if (recalled) {
      systemPrompt += recalled
    }

    // 3.5 联网搜索：在发给 LLM 之前先搜索全网
    if (webSearchEnabled.value) {
      try {
        webSearching.value = true
        setPhase('thinking', '🌐 正在搜索全网...')
        const searchResult = await webSearch(userText)
        if (searchResult.markdown) {
          systemPrompt += '\n\n' + searchResult.markdown
          console.log(`[WebSearch] 搜索完成: ${searchResult.results.length} 条结果, ~${searchResult.tokenEstimate} tokens, ${searchResult.searchTime}ms`)
        }
      } catch (err) {
        console.warn('[WebSearch] 搜索失败，降级为无搜索:', (err as Error).message)
      } finally {
        webSearching.value = false
      }
    }

    // 4. 重置本轮状态
    toolHistory.value = []
    currentToolProgress.value = null
    setPhase('sending')

    // 5. 开始 tool loop
    await runToolLoop(config, systemPrompt, options, runId)
  }

  /**
   * ★ 核心: Tool 调用循环
   * 持续调用 LLM，直到不再返回 tool_calls
   */
  async function runToolLoop(
    config: ApiConfig,
    systemPrompt: string,
    options: { agentId?: string; agentName?: string },
    runId: number,
  ) {
    const MAX_TOOL_ROUNDS = 10
    let round = 0

    while (round < MAX_TOOL_ROUNDS) {
      if (!isCurrentRun(runId)) return
      round++

      // 构建 API 消息（包括 tool results）
      const apiMessages = buildApiMessages(systemPrompt)

      // 准备 AI 回复占位
      const aiMsg: ChatMessage = {
        id: createMessageId('assistant'),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: options.agentId,
        agentName: options.agentName,
      }
      messages.value.push(aiMsg)
      const aiMsgId = aiMsg.id

      // 流式请求
      isStreaming.value = true
      const controller = new AbortController()
      abortController.value = controller
      setPhase('thinking')

      try {
        const res = await fetch(config.apiBase + '/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: buildHeaders(config),
          body: JSON.stringify({
            model: config.model,
            messages: apiMessages,
            stream: true,
            // ChatGPT 风格：不设 max_tokens，让模型自行决定输出长度
            // 模型会根据上下文自动分配输出 token
          }),
        })

        if (!res.ok) {
          const raw = await res.text()
          let parsed = null
          try { parsed = raw ? JSON.parse(raw) : null } catch {}
          const didWriteError = updateAssistantMessage(runId, aiMsgId, (msg) => {
            msg.content = buildChatErrorMessage(res.status, parsed, raw || '请求失败')
          })
          if (didWriteError && isCurrentRun(runId)) setPhase('error', `API ${res.status}`)
          finishController(runId, controller)
          return
        }

        // 读取 SSE 流
        if (!res.body) {
          const didWriteError = updateAssistantMessage(runId, aiMsgId, (msg) => {
            msg.content = '⚠️ API 响应为空，无法读取流式内容。'
          })
          if (didWriteError && isCurrentRun(runId)) setPhase('error', '空响应')
          finishController(runId, controller)
          return
        }

        const reader = res.body.getReader()
        const result = await new Promise<SSEResult>((resolve, reject) => {
          readSSEStream(
            reader,
            (fullText) => {
              if (updateAssistantMessage(runId, aiMsgId, (msg) => {
                msg.content = fullText
              }) && agentPhase.value !== 'replying') {
                setPhase('replying')
              }
            },
            (toolCalls) => {
              if (!findAssistantMessage(runId, aiMsgId)) return
              // 实时显示 tool_calls
              if (agentPhase.value !== 'tool') {
                const names = toolCalls.map(tc => tc.function.name).join(', ')
                setPhase('tool', names)
              }
            },
            (r) => resolve(r),
            (err) => reject(err),
          )
        })

        // 更新最终消息
        const didUpdateFinal = updateAssistantMessage(runId, aiMsgId, (msg) => {
          msg.content = result.fullText
          msg.toolCalls = result.toolCalls.length > 0 ? result.toolCalls : undefined
        })
        if (!didUpdateFinal) {
          finishController(runId, controller)
          return
        }

        // ★ 判断是否有 tool_calls 需要执行
        if (result.finishReason === 'tool_calls' || result.toolCalls.length > 0) {
          // 执行所有 tool calls
          for (const call of result.toolCalls) {
            if (!findAssistantMessage(runId, aiMsgId)) {
              finishController(runId, controller)
              return
            }
            // 更新进度
            const progress: ToolProgress = {
              toolCallId: call.id,
              name: call.function.name,
              phase: 'executing',
              args: call.function.arguments,
              result: null,
              isError: false,
              startedAtMs: Date.now(),
              finishedAtMs: null,
            }
            currentToolProgress.value = progress
            setPhase('tool', call.function.name)

            // 执行
            let toolResult: string
            try {
              toolResult = await executeToolCall(call)
              try {
                const parsedToolResult = JSON.parse(toolResult) as { status?: string; error?: unknown }
                if (parsedToolResult.status === 'error' || parsedToolResult.error) {
                  progress.isError = true
                }
              } catch {}
            } catch (err) {
              toolResult = JSON.stringify({ error: (err as Error).message })
              progress.isError = true
            }

            if (!findAssistantMessage(runId, aiMsgId)) {
              finishController(runId, controller)
              return
            }

            // 更新进度
            progress.phase = 'result'
            progress.result = toolResult
            progress.finishedAtMs = Date.now()
            currentToolProgress.value = { ...progress }
            toolHistory.value.push({ ...progress })

            // 添加 tool result 消息
            const toolMsg: ChatMessage = {
              id: createMessageId('tool'),
              role: 'tool',
              content: toolResult,
              timestamp: Date.now(),
              toolCallId: call.id,
              toolName: call.function.name,
            }
            messages.value.push(toolMsg)
          }

          // 继续循环 — 将 tool results 回送给 LLM
          finishController(runId, controller)
          continue
        }

        // 无 tool_calls → 正常结束
        if (isCurrentRun(runId)) {
          setPhase('done')
          currentToolProgress.value = null
        }
        finishController(runId, controller)
        return

      } catch (err) {
        if (!isCurrentRun(runId)) return
        const message = (err as Error).message
        const errMsg = (err as Error).name === 'AbortError'
          ? '⚠️ 生成已手动停止'
          : message.startsWith('⚠️') ? message : '⚠️ ' + message
        const didWriteError = updateAssistantMessage(runId, aiMsgId, (msg) => {
          msg.content = errMsg
        })
        if (didWriteError) setPhase('error', message)
        finishController(runId, controller)
        return
      }
    }

    // 超过最大轮次
    if (!isCurrentRun(runId)) return
    messages.value.push({
      id: createMessageId('assistant'),
      role: 'assistant',
      content: '⚠️ 工具调用轮次超限 (最多 10 轮)，已自动停止。',
      timestamp: Date.now(),
    })
    setPhase('done')
    isStreaming.value = false
    abortController.value = null
  }

  /**
   * 估算消息的 token 数（粗略：1 token ≈ 4 字符英文 / 2 字符中文）
   */
  function estimateTokens(content: unknown): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content || '')
    // 中英文混合：取较大估算值
    const enTokens = text.length / 4
    const zhChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    return Math.ceil(enTokens + zhChars * 0.5)
  }

  /**
   * 构建 API 消息列表（ChatGPT 风格：智能截断上下文）
   *
   * 策略：
   * - 保留 system prompt
   * - 从最新消息往前取，直到达到上下文预算
   * - 旧消息中的 base64 图片替换为占位符（节省 token）
   * - 上下文预算 = 模型窗口 - 预留输出空间
   */
  function buildApiMessages(systemPrompt: string) {
    // 上下文预算：预留 32K 给输出，其余给输入
    const MAX_INPUT_TOKENS = 200000 // ~200K tokens 输入预算，适配大部分模型
    const systemTokens = estimateTokens(systemPrompt)
    let remainingBudget = MAX_INPUT_TOKENS - systemTokens

    // 将消息转为 API 格式（从最新到最旧）
    const allMessages = messages.value.filter(m => m.role !== 'system')
    const selected: Array<Record<string, unknown>> = []

    // 从最新消息往前扫描
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const m = allMessages[i]
      const isRecent = (allMessages.length - 1 - i) < 6 // 最近 3 轮（6 条消息）

      let formatted: Record<string, unknown>

      if (m.role === 'tool') {
        formatted = { role: 'tool', content: m.content, tool_call_id: m.toolCallId }
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        formatted = { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls }
      } else if (m.role === 'user' && (m.images?.length || m.files?.length)) {
        const contentParts: Array<Record<string, unknown>> = []
        if (m.content) contentParts.push({ type: 'text', text: m.content })

        // 图片：最近消息保留，旧消息移除 base64（节省大量 token）
        if (m.images) {
          for (const img of m.images) {
            if (isRecent || !img.startsWith('data:')) {
              contentParts.push({ type: 'image_url', image_url: { url: img } })
            } else {
              contentParts.push({ type: 'text', text: '[图片已省略]' })
            }
          }
        }
        if (m.files) {
          for (const f of m.files) {
            contentParts.push({ type: 'text', text: `\n\n[文件: ${f.name}]\n${f.content}` })
          }
        }
        formatted = { role: 'user', content: contentParts }
      } else {
        formatted = { role: m.role, content: m.content }
      }

      const msgTokens = estimateTokens(formatted.content)

      // 最近 3 轮必须保留（即使超预算）
      if (!isRecent && msgTokens > remainingBudget) break

      remainingBudget -= msgTokens
      selected.unshift(formatted)
    }

    return [
      { role: 'system', content: systemPrompt },
      ...selected,
    ]
  }

  /** 停止生成 */
  function stopStream() {
    cancelCurrentRun()
  }

  /** 清空消息 */
  function clearMessages() {
    cancelCurrentRun()
    messages.value = []
    setPhase('idle')
    toolHistory.value = []
    currentToolProgress.value = null
  }

  /** 加载历史消息 */
  function loadMessages(history: ChatMessage[]) {
    cancelCurrentRun()
    messages.value = history
    setPhase('idle')
    toolHistory.value = []
    currentToolProgress.value = null
  }

  /** 切换联网搜索开关 */
  function toggleWebSearch() {
    webSearchEnabled.value = !webSearchEnabled.value
    localStorage.setItem('jc_web_search', String(webSearchEnabled.value))
  }

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStream,
    clearMessages,
    loadMessages,
    // 工具调用状态（供 UI 消费）
    agentPhase,
    agentDetail,
    currentToolProgress,
    toolHistory,
    // 联网搜索
    webSearchEnabled,
    webSearching,
    toggleWebSearch,
  }
}
