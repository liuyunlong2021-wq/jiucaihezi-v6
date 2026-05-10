<script setup lang="ts">
/**
 * ChatPanel — 对话面板容器
 * 源自 code.html #chat-panel (行 1094-1169)
 * 
 * 使用 useChat composable 实现真实的 streaming 对话
 */
import { ref, nextTick, watch } from 'vue'
import { useChat } from '@/composables/useChat'

const { messages, isStreaming, sendMessage, stopStream } = useChat()

// 当前搭子信息（后续从 agentStore 获取）
const currentAgentName = ref('默认助手')
const currentModel = ref(localStorage.getItem('jcModel') || '选择模型')

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(messages, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { deep: true })

// 发送消息
async function handleSend() {
  if (!inputText.value.trim() || isStreaming.value) return
  const text = inputText.value
  inputText.value = ''
  await sendMessage(text, {
    agentName: currentAgentName.value,
  })
}

// 处理键盘事件 — 对应 code.html chatKeydown (行 1159)
function onKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl+Enter 发送
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    handleSend()
  }
}

// textarea 自动增高 — 对应 code.html autoGrow
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 320) + 'px'
}

function handleInput(e: Event) {
  autoGrow(e.target as HTMLTextAreaElement)
}

// 停止生成
function handleStop() {
  stopStream()
}
</script>

<template>
  <div class="cp">
    <!-- Header — from code.html #chat-panel-header (行 1095-1118) -->
    <div class="cp-header">
      <div class="cp-title">
        <span class="mso" style="font-size: 17px; color: var(--olive-dark);">smart_toy</span>
        <span class="cp-name">{{ currentAgentName }}</span>
      </div>
      <div class="cp-actions">
        <button class="cp-model-btn" title="切换模型">
          <span class="mso" style="font-size: 14px;">deployed_code</span>
          {{ currentModel }}
        </button>
        <button class="cp-act-btn" title="新对话" @click="messages = []">
          <span class="mso">add</span>
        </button>
      </div>
    </div>

    <!-- Messages — from code.html #chat-messages (行 1119) -->
    <div ref="messagesContainer" class="cp-messages">
      <!-- Welcome state -->
      <div v-if="messages.length === 0" class="cp-welcome">
        <h2 class="serif">韭菜盒子</h2>
        <p>聊天用豆包，干活用韭菜盒子。</p>
      </div>

      <!-- Message list -->
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="msg"
        :class="msg.role"
      >
        <div class="msg-meta">
          <div class="msg-meta-avatar">
            <span class="mso" style="font-size: 14px;">
              {{ msg.role === 'user' ? 'person' : 'smart_toy' }}
            </span>
          </div>
          <span class="msg-meta-name">
            {{ msg.role === 'user' ? '你' : (msg.agentName || '助手') }}
          </span>
        </div>
        <div class="msg-bubble">
          <div class="msg-body" v-html="msg.content.replace(/\n/g, '<br>')"></div>
        </div>
      </div>

      <!-- Streaming indicator -->
      <div v-if="isStreaming && messages.length > 0 && !messages[messages.length - 1]?.content" class="msg assistant">
        <div class="msg-meta">
          <div class="msg-meta-avatar"><span class="mso" style="font-size: 14px;">smart_toy</span></div>
          <span class="msg-meta-name">{{ currentAgentName }}</span>
        </div>
        <div class="msg-bubble">
          <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
        </div>
      </div>
    </div>

    <!-- Input — from code.html #chat-input-area (行 1126-1168) -->
    <div class="cp-input-area">
      <div class="cp-input-wrap">
        <textarea
          v-model="inputText"
          placeholder="给搭子发指令... (Cmd/Ctrl+Enter发送)"
          rows="1"
          @keydown="onKeydown"
          @input="handleInput"
        />
        <div class="cp-input-actions">
          <button class="ci-btn" title="附件">
            <span class="mso">attach_file</span>
          </button>
          <button
            v-if="isStreaming"
            class="cp-stop"
            @click="handleStop"
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
  min-height: 24px;
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
</style>
