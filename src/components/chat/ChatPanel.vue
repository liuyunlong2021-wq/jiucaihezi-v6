<script setup lang="ts">
/**
 * ChatPanel — 对话面板容器（Superpowers 完全体）
 *
 * 集成：
 *   1. Session Hook — 对话开始时注入 bootstrap prompt
 *   2. Skill Dispatch — LLM 路由 + 完整 SKILL.md 注入
 *   3. Chain Invoke — 检测 AI 回复中的 [INVOKE:xxx] + 用户确认
 *   4. Pipeline 可视化 — 阶段进度条
 *   5. karpathy-wiki — 学习开关自动收集
 */
import { ref, nextTick, watch, computed, onMounted } from 'vue'
import { useChat } from '@/composables/useChat'
import { useAgentStore, PILL_MODELS } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useSkillRouter } from '@/composables/useSkillRouter'
import { useFileStore } from '@/composables/useFileStore'
import MessageBubble from './MessageBubble.vue'
import FileUploader from './FileUploader.vue'
import ChatScrollNav from './ChatScrollNav.vue'
import AgentStatusBar from './AgentStatusBar.vue'
import SkillPickerBar from './SkillPickerBar.vue'

const agentStore = useAgentStore()
const sessionStore = useSessionStore()
const { messages, isStreaming, sendMessage, stopStream, clearMessages, loadMessages,
  agentPhase, agentDetail, currentToolProgress, toolHistory } = useChat()
const {
  routeNotification, isRouting, routeMessage,
  // Superpowers 新增
  currentPhase, currentSkillId, pendingInvoke, pipelineActive, phaseHistory,
  PIPELINE_STAGES,
  buildSuperpowersPrompt, processChainInvoke, confirmChainInvoke, rejectChainInvoke, resetPipeline,
} = useSkillRouter()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showModelMenu = ref(false)
const fileUploader = ref<InstanceType<typeof FileUploader> | null>(null)
const scrollNav = ref<InstanceType<typeof ChatScrollNav> | null>(null)

// 输入历史回填 (V4 stepChatInputRecall 行 7714)
const recallState = ref({ index: -1, draft: '' })
function stepInputRecall(direction: number) {
  const pool = messages.value.filter(m => m.role === 'user').map(m => m.content)
  if (!pool.length) return
  const state = recallState.value
  if (state.index === -1) state.draft = inputText.value
  let next = state.index + direction
  if (next < -1) next = -1
  if (next >= pool.length) next = pool.length - 1
  recallState.value = { index: next, draft: state.draft }
  inputText.value = next === -1 ? state.draft : pool[pool.length - 1 - next]
}
function resetRecall() { recallState.value = { index: -1, draft: '' } }

// 学习开关 — 开启后调用 karpathy-llm-wiki 持续摄入对话
const learningEnabled = ref(localStorage.getItem('jc_learning') === 'true')
function toggleLearning() {
  learningEnabled.value = !learningEnabled.value
  localStorage.setItem('jc_learning', String(learningEnabled.value))
}

// 当前状态显示
const headerStatus = computed(() => {
  if (pipelineActive.value && currentSkillId.value) {
    const stage = PIPELINE_STAGES.find(s => s.id === currentSkillId.value)
    return stage ? `⚡ ${stage.name}` : agentStore.modelLabel
  }
  return agentStore.currentAgent
    ? `正在调用 ${agentStore.currentAgent.name}`
    : agentStore.modelLabel
})

// 当前 sessionId
let currentSessionId = ''

// 自动滚动到底部
watch(messages, () => {
  nextTick(() => {
    scrollNav.value?.autoScrollIfNeeded()
  })
}, { deep: true })

// 切换对话时加载历史消息
watch(() => sessionStore.activeSessionId, async (newId) => {
  if (!newId) {
    clearMessages()
    currentSessionId = ''
    resetPipeline() // 新对话重置 pipeline
    return
  }
  if (newId === currentSessionId) return
  currentSessionId = newId
  const history = await sessionStore.loadSessionMessages(newId)
  loadMessages(history)
})

/**
 * 构建 system prompt（Superpowers 完全体）
 * 牛马开关 ON → 使用完整 superpowers prompt（session hook + skill 工作流）
 * 牛马开关 OFF → 仅用搭子的 skillContent
 */
function buildSystemPrompt(): string | undefined {
  if (agentStore.routerEnabled) {
    // Superpowers 模式：session hook + 当前 skill 全文
    return buildSuperpowersPrompt(agentStore.agents, agentStore.currentAgent || null)
  }
  // 普通模式：仅 skillContent
  return agentStore.currentAgent?.skillContent || undefined
}

// 发送消息 + superpowers 完整流程
async function handleSend() {
  const hasText = inputText.value.trim().length > 0
  const hasAttachments = (fileUploader.value?.attachedFiles?.length || 0) > 0
  const isFileProcessing = fileUploader.value?.isProcessing

  if ((!hasText && !hasAttachments) || isStreaming.value || isFileProcessing) return

  const text = inputText.value.trim() || (hasAttachments ? '请分析这些文件' : '')
  inputText.value = ''

  // 收集附件
  const attachedFiles = fileUploader.value?.attachedFiles || []
  const images: string[] = []
  const files: Array<{ name: string; content: string }> = []

  for (const af of attachedFiles) {
    if (af.preview) {
      images.push(af.preview)
    } else if (af.textContent) {
      files.push({ name: af.file.name, content: af.textContent })
    }
  }

  // 清空附件
  fileUploader.value?.clearAll()

  // 1. Superpowers 路由：牛马开关 ON 时自动分析意图
  if (agentStore.routerEnabled) {
    const routableSkills = agentStore.getRoutableSkills()
    if (routableSkills.length > 0) {
      const result = await routeMessage(text, routableSkills)
      if (result.strategy === 'single' && result.matched.length > 0) {
        agentStore.selectAgent(result.matched[0].skillId)
        agentStore.incrementCallCount(result.matched[0].skillId)
      } else if (result.strategy === 'chain' && result.matched.length > 0) {
        agentStore.selectAgent(result.matched[0].skillId)
        agentStore.incrementCallCount(result.matched[0].skillId)
      }
    }
  }

  // 2. 首次发消息时创建 session
  if (!currentSessionId) {
    currentSessionId = sessionStore.startNewSession(agentStore.currentAgent?.id || '')
  }

  // 3. 发送消息（使用 superpowers 完整 prompt + 附件）
  await sendMessage(text, {
    systemPrompt: buildSystemPrompt(),
    agentId: agentStore.currentAgent?.id,
    agentName: agentStore.currentAgent?.name || agentStore.modelLabel,
    images: images.length > 0 ? images : undefined,
    files: files.length > 0 ? files : undefined,
  })

  // 4. Chain Invoke 检测：检查 AI 最新回复是否包含 [INVOKE:xxx]
  if (agentStore.routerEnabled) {
    const lastMsg = messages.value.at(-1)
    if (lastMsg && lastMsg.role === 'assistant') {
      processChainInvoke(lastMsg.content)
    }
  }

  // 5. 保存到 IndexedDB
  sessionStore.saveSession(
    currentSessionId,
    agentStore.currentAgent?.id || '',
    messages.value,
  )

  // 6. 整理模式：自动将对话存入知识库
  if (learningEnabled.value) {
    const lastTwo = messages.value.slice(-2)
    const convo = lastTwo.map(m => `${m.role}: ${m.content}`).join('\n')
    const skillId = agentStore.currentAgent?.id || 'general'
    const topic = agentStore.currentAgent?.name || '通用'
    const fs = useFileStore()
    fs.addKnowledge({
      name: `对话_${new Date().toLocaleTimeString('zh-CN')}`,
      content: convo,
      topic,
      skillId,
      indexed: false,
    })
  }
}

// Chain Invoke 用户确认 → 切换到下一阶段并自动发消息
async function handleConfirmChain() {
  const nextSkill = confirmChainInvoke(agentStore.agents)
  if (nextSkill) {
    agentStore.selectAgent(nextSkill.id)
    // 自动发一条消息让 AI 开始下一阶段的工作
    await sendMessage('请开始这个阶段的工作。', {
      systemPrompt: buildSystemPrompt(),
      agentId: nextSkill.id,
      agentName: nextSkill.name,
    })
    // 检测新回复是否又有 chain invoke
    const lastMsg = messages.value.at(-1)
    if (lastMsg && lastMsg.role === 'assistant') {
      processChainInvoke(lastMsg.content)
    }
    // 保存
    sessionStore.saveSession(currentSessionId, nextSkill.id, messages.value)
  }
}

// Chain Invoke 用户拒绝
function handleRejectChain() {
  rejectChainInvoke()
}

// 新对话
function startNew() {
  clearMessages()
  currentSessionId = ''
  sessionStore.switchSession('')
  resetPipeline()
}

// 切换模型
function selectModel(modelId: string) {
  agentStore.setModel(modelId)
  showModelMenu.value = false
}

// 键盘事件 (V4 chatKeydown 行 10678)
function onKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl+Shift+↑↓ → 输入历史回填
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    stepInputRecall(e.key === 'ArrowUp' ? 1 : -1)
    return
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    handleSend()
  }
}

// 删除消息
function deleteMessage(index: number) {
  messages.value.splice(index, 1)
}

// 重新发送
function retryMessage(index: number) {
  const msg = messages.value[index]
  if (msg && msg.role === 'user') {
    // 删除该消息及之后的所有消息
    messages.value.splice(index)
    inputText.value = msg.content
  }
}

// textarea 自动增高
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 320) + 'px'
}

function handleInput(e: Event) {
  autoGrow(e.target as HTMLTextAreaElement)
}

onMounted(() => {
  agentStore.restoreLastAgent()
  sessionStore.loadAllSessions()
})

// ─── 拖拽上传 ───
const isDragOver = ref(false)
let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (dragLeaveTimer) { clearTimeout(dragLeaveTimer); dragLeaveTimer = null }
  isDragOver.value = true
  fileUploader.value?.handleDragOver(e)
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  // 延迟关闭避免子元素触发 dragleave
  dragLeaveTimer = setTimeout(() => { isDragOver.value = false }, 100)
  fileUploader.value?.handleDragLeave(e)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  if (dragLeaveTimer) { clearTimeout(dragLeaveTimer); dragLeaveTimer = null }
  fileUploader.value?.handleDrop(e)
}
</script>

<template>
  <div class="cp"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 拖拽上传覆盖层 -->
    <div v-if="isDragOver" class="cp-drag-overlay">
      <span class="mso" style="font-size:48px">upload_file</span>
      <span>松开上传文件</span>
    </div>
    <!-- Header — from code.html #chat-panel-header (行 1095-1118) -->
    <div class="cp-header">
      <div class="cp-title">
        <span class="cp-name">{{ headerStatus }}</span>
        <span v-if="routeNotification" class="cp-route-badge">{{ routeNotification }}</span>
        <span v-if="isRouting" class="cp-route-badge routing">🔄 路由中...</span>
      </div>
      <div class="cp-actions">
        <!-- 模型选择 -->
        <div class="cp-model-wrap">
          <button class="cp-model-btn" @click="showModelMenu = !showModelMenu">
            <span class="mso" style="font-size: 14px;">deployed_code</span>
            {{ agentStore.modelLabel }}
          </button>
          <div v-if="showModelMenu" class="cp-model-menu">
            <button
              v-for="m in PILL_MODELS"
              :key="m.id"
              class="cp-model-item"
              :class="{ active: m.id === agentStore.currentModel }"
              @click="selectModel(m.id)"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <!-- 整理药丸开关 -->
        <button class="cp-pill-toggle" :class="{ on: learningEnabled }"
                title="整理模式（自动将对话整理到知识库）" @click="toggleLearning">
          <span class="cp-pill-dot"></span>
          <span class="cp-pill-text">整理</span>
        </button>
      </div>
    </div>

    <!-- ★ Superpowers Pipeline 进度条 -->
    <div v-if="pipelineActive && agentStore.routerEnabled" class="cp-pipeline">
      <div v-for="(stage, i) in PIPELINE_STAGES" :key="stage.id" class="cp-pipeline-step"
           :class="{
             active: currentSkillId === stage.id,
             done: phaseHistory.includes(stage.id) && currentSkillId !== stage.id,
           }">
        <span class="mso cp-pipeline-icon">{{ stage.icon }}</span>
        <span class="cp-pipeline-label">{{ stage.name }}</span>
        <span v-if="i < PIPELINE_STAGES.length - 1" class="cp-pipeline-arrow">→</span>
      </div>
    </div>

    <!-- ★ Chain Invoke 确认弹窗 -->
    <div v-if="pendingInvoke" class="cp-chain-confirm">
      <div class="cp-chain-msg">
        <span class="mso" style="font-size:18px">arrow_forward</span>
        AI 请求进入下一阶段:
        <strong>{{ PIPELINE_STAGES.find(s => s.id === pendingInvoke)?.name || pendingInvoke }}</strong>
      </div>
      <div class="cp-chain-actions">
        <button class="cp-chain-btn confirm" @click="handleConfirmChain">✓ 确认进入</button>
        <button class="cp-chain-btn reject" @click="handleRejectChain">✗ 跳过</button>
      </div>
    </div>

    <!-- Messages -->
    <!-- 消息区 (带滚动导航) -->
    <div ref="messagesContainer" class="cp-messages"
         @dragover.prevent="fileUploader?.handleDragOver($event)"
         @dragleave.prevent="fileUploader?.handleDragLeave($event)"
         @drop.prevent="fileUploader?.handleDrop($event)">
      <!-- Welcome -->
      <div v-if="messages.length === 0" class="cp-welcome">
        <h2 class="serif">韭菜盒子</h2>
        <p>聊天用豆包，干活用韭菜盒子。</p>
      </div>

      <!-- Message list (使用 MessageBubble 组件) -->
      <MessageBubble
        v-for="(msg, i) in messages.filter(m => m.content || m.toolCalls)"
        :key="msg.id"
        :content="msg.content"
        :role="msg.role"
        :agent-name="msg.agentName"
        :index="i"
        :tool-calls="msg.toolCalls"
        :tool-name="msg.toolName"
        :images="msg.images"
        :files="msg.files"
        @retry="retryMessage"
        @delete="deleteMessage"
      />

      <!-- Streaming indicator -->
      <div v-if="isStreaming && (!messages.length || !messages[messages.length - 1]?.content)" class="msg assistant">
        <div class="msg-meta">
          <div class="msg-meta-avatar"><span class="mso" style="font-size: 14px;">smart_toy</span></div>
          <span class="msg-meta-name">{{ agentStore.currentAgent?.name || agentStore.modelLabel }}</span>
        </div>
        <div class="msg-bubble">
          <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
        </div>
      </div>
    </div>

    <!-- 滚动导航（移到对话框右侧） -->
    <ChatScrollNav ref="scrollNav" :container="messagesContainer" :is-streaming="isStreaming" :messages="messages" />

    <!-- Agent 状态条 -->
    <AgentStatusBar
      :phase="agentPhase"
      :detail="agentDetail"
      :tool-progress="currentToolProgress"
      :tool-history="toolHistory"
    />

    <!-- 附件预览 -->
    <FileUploader ref="fileUploader" />

    <!-- 搭子快捷按钮栏 -->
    <SkillPickerBar />

    <!-- 输入区 -->
    <div class="cp-input-area">
      <div class="cp-input-wrap">
        <textarea
          v-model="inputText"
          placeholder="给搭子发指令... (Cmd/Ctrl+Enter发送)"
          rows="4"
          @keydown="onKeydown"
          @input="handleInput"
          @paste="fileUploader?.handlePaste($event)"
        />
        <div class="cp-input-actions">
          <button class="ci-btn" title="上传文件" @click="fileUploader?.triggerFileInput()">
            <span class="mso">attach_file</span>
          </button>
          <button
            v-if="isStreaming"
            class="cp-stop"
            @click="stopStream"
            title="停止生成"
          >
            <span class="mso">stop</span>
          </button>
          <button
            v-else
            class="cp-send"
            :disabled="!inputText.trim()"
            @click="handleSend"
          >
            <span class="mso">send</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  position: relative;
  width: 100%;
}

/* 拖拽上传覆盖层 */
.cp-drag-overlay {
  position: absolute; inset: 0; z-index: 100;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  background: rgba(107,142,35,.08);
  border: 3px dashed var(--olive);
  border-radius: 12px;
  color: var(--olive); font-size: 16px; font-weight: 700;
  pointer-events: none;
  animation: drag-pulse .8s ease infinite alternate;
}
@keyframes drag-pulse {
  from { background: rgba(107,142,35,.05); }
  to { background: rgba(107,142,35,.15); }
}

/* Header — from code.html line 208-219 */
.cp-header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--border2);
  background: var(--surface-alt);
  flex-shrink: 0;
  gap: 12px;
}
.cp-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.cp-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}
.cp-route-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--olive);
  color: #fff;
  font-weight: 600;
  animation: routeFade 3s forwards;
}
.cp-route-badge.routing {
  background: var(--line);
  color: var(--ink3);
  animation: none;
}
@keyframes routeFade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
.cp-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cp-model-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink2);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.cp-model-btn:hover {
  border-color: rgba(213, 199, 135, 0.45);
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.cp-act-btn {
  width: 30px; height: 30px;
  border: none; background: none;
  border-radius: 8px;
  color: var(--ink2);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px;
}
.cp-act-btn:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}

/* Messages — from code.html line 283-365 */
.cp-messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px 16px;
  min-height: 0;
  position: relative;
}
.msg {
  display: flex;
  margin-bottom: 16px;
  flex-direction: column;
}
.msg.user { align-items: flex-end; }
.msg.assistant { align-items: flex-start; }
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 6px;
  font-size: 11px;
  color: var(--ink3);
}
.msg.user .msg-meta { justify-content: flex-end; }
.msg-meta-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center; justify-content: center;
  background: rgba(213, 199, 135, 0.16);
  color: var(--olive-dark);
}
.msg.user .msg-meta-avatar {
  background: rgba(244, 241, 232, 0.92);
  color: var(--ink2);
  border: 1px solid color-mix(in srgb, #F4F1E8 78%, var(--border));
}
.msg-meta-name {
  font-weight: 700;
  color: var(--ink2);
}
.msg-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.7;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.msg.user .msg-bubble {
  background: var(--jc-surface-container-low);
  color: var(--ink);
  border: 1px solid var(--border);
  border-bottom-right-radius: 4px;
}
.msg.assistant .msg-bubble {
  background: var(--surface-alt);
  color: var(--ink);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}
.msg-body { white-space: pre-wrap; }

/* Welcome */
.cp-welcome {
  text-align: center;
  padding: 80px 24px;
  color: var(--ink3);
}
.cp-welcome h2 {
  font-size: 24px;
  color: var(--ink);
  margin-bottom: 8px;
}
.cp-welcome p {
  font-size: 14px;
  max-width: 400px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Typing dots — from code.html line 362-365 */
.typing-dot {
  display: inline-block;
  width: 6px; height: 6px;
  background: var(--ink3);
  border-radius: 50%;
  margin: 0 2px;
  animation: bounce 0.6s infinite alternate;
}
.typing-dot:nth-child(2) { animation-delay: 0.15s; }
.typing-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce { to { transform: translateY(-4px); opacity: 0.4; } }

/* Input — from code.html line 374-388 */
.cp-input-area {
  padding: 10px 14px;
  border-top: 1px solid var(--border2);
  background: var(--surface);
  flex-shrink: 0;
}
.cp-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px 14px;
  transition: border-color 0.2s;
}
.cp-input-wrap:focus-within {
  border-color: var(--olive);
}
.cp-input-wrap textarea {
  flex: 1;
  border: none;
  background: none;
  font-size: 14px;
  font-family: inherit;
  color: var(--ink);
  outline: none;
  resize: none;
  max-height: 320px;
  min-height: 72px;
  line-height: 1.6;
}
.cp-input-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  align-self: flex-end;
  padding-bottom: 2px;
}
.ci-btn {
  width: 30px; height: 30px;
  border: none; background: none;
  border-radius: 50%;
  color: var(--ink3);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  transition: all 0.12s;
}
.ci-btn:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.cp-send, .cp-stop {
  height: 36px;
  min-width: 36px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  transition: transform 0.1s;
}
.cp-send {
  background: var(--olive);
  color: #fff;
}
.cp-send:hover { transform: scale(1.05); }
.cp-send:disabled { opacity: 0.4; cursor: default; transform: none; }
.cp-stop {
  background: var(--jc-error);
  color: #fff;
}
.cp-stop:hover { transform: scale(1.05); }

/* Model dropdown — from code.html 行 704-712 */
.cp-model-wrap {
  position: relative;
}
.cp-model-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 300px;
  overflow-y: auto;
}
.cp-model-item {
  padding: 7px 12px;
  border: none;
  background: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink2);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.12s;
}
.cp-model-item:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.cp-model-item.active {
  background: rgba(213, 199, 135, 0.18);
  color: var(--olive-dark);
}

/* 药丸开关 */
.cp-pill-toggle {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px 3px 4px; border-radius: 20px;
  border: 1px solid var(--border); background: var(--surface-alt);
  cursor: pointer; font-family: inherit; transition: all .25s;
}
.cp-pill-toggle:hover { border-color: var(--olive); }
.cp-pill-toggle.on { background: var(--olive); border-color: var(--olive); }
.cp-pill-dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--ink3); opacity: .3;
  transition: all .25s; flex-shrink: 0;
}
.cp-pill-toggle.on .cp-pill-dot {
  background: #fff; opacity: 1; transform: translateX(0);
}
.cp-pill-text {
  font-size: 10px; font-weight: 700; color: var(--ink3); line-height: 1;
}
.cp-pill-toggle.on .cp-pill-text { color: #fff; }

/* ─── Superpowers Pipeline 进度条 ─── */
.cp-pipeline {
  display: flex; align-items: center; gap: 2px;
  padding: 6px 16px; border-bottom: 1px solid var(--line);
  background: linear-gradient(135deg, rgba(107,142,35,.03), rgba(213,199,135,.06));
  overflow-x: auto;
}
.cp-pipeline-step {
  display: flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 12px;
  font-size: 11px; color: var(--ink3);
  transition: all .2s; white-space: nowrap;
}
.cp-pipeline-step.active {
  background: var(--olive); color: #fff; font-weight: 700;
  box-shadow: 0 2px 8px rgba(107,142,35,.3);
}
.cp-pipeline-step.done {
  background: rgba(107,142,35,.1); color: var(--olive-dark); font-weight: 600;
}
.cp-pipeline-icon { font-size: 14px !important; }
.cp-pipeline-label { font-size: 11px; }
.cp-pipeline-arrow { color: var(--ink3); opacity: .4; margin: 0 2px; font-size: 12px; }

/* ─── Chain Invoke 确认条 ─── */
.cp-chain-confirm {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; gap: 12px;
  background: linear-gradient(135deg, rgba(107,142,35,.08), rgba(213,199,135,.12));
  border-bottom: 1.5px solid var(--olive);
  animation: chain-slide-in .3s ease;
}
@keyframes chain-slide-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.cp-chain-msg {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--ink1);
}
.cp-chain-msg strong { color: var(--olive-dark); }
.cp-chain-actions { display: flex; gap: 6px; flex-shrink: 0; }
.cp-chain-btn {
  padding: 5px 14px; border-radius: 8px; font-size: 12px; font-weight: 700;
  border: none; cursor: pointer; font-family: inherit; transition: all .12s;
}
.cp-chain-btn.confirm {
  background: var(--olive); color: #fff;
}
.cp-chain-btn.confirm:hover { filter: brightness(1.1); }
.cp-chain-btn.reject {
  background: var(--surface); color: var(--ink3); border: 1px solid var(--line);
}
.cp-chain-btn.reject:hover { border-color: var(--ink3); }
</style>
