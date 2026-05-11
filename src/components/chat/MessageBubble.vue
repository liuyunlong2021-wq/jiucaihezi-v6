<script setup lang="ts">
/**
 * MessageBubble.vue — 消息气泡（Markdown + 代码复制 + 操作栏）
 *
 * 移植自 V4 code.html:
 *   - renderChat() 行 7931 — markdown 渲染
 *   - copyCodeBlock 行 7420 — 代码块复制
 *   - copyMsgFloat 行 7411 — 消息复制
 *   - shouldCreateAssistantDocumentCard 行 7437 — 长文导入
 */
import { computed, ref } from 'vue'
import { marked } from 'marked'
import ToolCallCard from './ToolCallCard.vue'
import type { ToolCall } from '@/composables/useChat'
import { useNotebook } from '@/composables/useNotebook'
import { emitEvent } from '@/utils/eventBus'

const props = defineProps<{
  content: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  agentName?: string
  index: number
  toolCalls?: ToolCall[]
  toolName?: string
}>()

const emit = defineEmits<{
  (e: 'retry', index: number): void
  (e: 'delete', index: number): void
}>()

const showActions = ref(false)
const copyLabel = ref('content_copy')

// Markdown 渲染
const renderedHtml = computed(() => {
  if (!props.content) return ''
  if (props.role === 'user') {
    return props.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
  try {
    const html = marked.parse(props.content, { breaks: true, gfm: true }) as string
    // 给代码块注入复制按钮
    return html.replace(
      /<pre><code(?: class="language-(\w+)")?>/g,
      (_match, lang) => {
        const langLabel = lang || 'code'
        return `<div class="md-code"><div class="md-code-head"><span class="md-code-lang">${langLabel}</span><button class="md-code-copy" onclick="this.closest('.md-code').querySelector('code')&&navigator.clipboard.writeText(this.closest('.md-code').querySelector('code').textContent).then(()=>{this.textContent='已复制 ✓';this.classList.add('copied');setTimeout(()=>{this.textContent='复制';this.classList.remove('copied')},1200)})">复制</button></div><pre><code class="language-${langLabel}">`
      }
    ).replace(/<\/code><\/pre>/g, '</code></pre></div>')
  } catch {
    return props.content.replace(/\n/g, '<br>')
  }
})

// 长文导入检测 (V4 shouldCreateAssistantDocumentCard 行 7437)
const showImportBtn = computed(() => {
  if (props.role !== 'assistant' || !props.content) return false
  const text = props.content.trim()
  const compact = text.replace(/\s+/g, '').length
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length
  const headings = (text.match(/^#{1,6}\s+/gm) || []).length
  const listItems = (text.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) || []).length
  if (compact >= 900) return true
  return compact >= 420 && (paragraphs >= 4 || headings >= 1 || listItems >= 4)
})

// 复制消息 (V4 copyMsgFloat 行 7411)
function copyMessage() {
  navigator.clipboard.writeText(props.content).then(() => {
    copyLabel.value = 'check'
    setTimeout(() => { copyLabel.value = 'content_copy' }, 1200)
  })
}

// 导入到编辑区 — 直接写入第五列 EditorPanel
const { addAgentBlock, blocks: nbBlocks } = useNotebook()
const importLabel = ref('导入编辑区')
const appendLabel = ref('追加编辑区')

function importToEditor() {
  addAgentBlock(
    props.agentName || '助手',
    props.agentName || '助手',
    props.content
  )
  emitEvent('switch-panel', 'editor')
  importLabel.value = '✓ 已导入'
  setTimeout(() => { importLabel.value = '导入编辑区' }, 1500)
}

function appendToEditor() {
  addAgentBlock(
    props.agentName || '助手',
    props.agentName || '助手',
    props.content
  )
  emitEvent('switch-panel', 'editor')
  appendLabel.value = '✓ 已追加'
  setTimeout(() => { appendLabel.value = '追加编辑区' }, 1500)
}
</script>

<template>
  <div
    class="msg" :class="role"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <div class="msg-meta">
      <div class="msg-meta-avatar">
        <span class="mso" style="font-size: 14px;">
          {{ role === 'user' ? 'person' : role === 'tool' ? 'build' : 'smart_toy' }}
        </span>
      </div>
      <span class="msg-meta-name">
        {{ role === 'user' ? '你' : role === 'tool' ? `工具: ${toolName || '结果'}` : (agentName || '助手') }}
      </span>
    </div>
    <div class="msg-bubble">
      <div class="msg-body" v-html="renderedHtml"></div>

      <!-- 工具调用卡片 -->
      <ToolCallCard v-if="toolCalls && toolCalls.length" :tool-calls="toolCalls" />

      <!-- 导入/追加编辑区按钮 -->
      <div v-if="showImportBtn" class="msg-import-group">
        <button class="msg-import-btn" :class="{ copied: importLabel !== '导入编辑区' }" @click="importToEditor">
          <span class="mso">{{ importLabel === '导入编辑区' ? 'content_paste_go' : 'check' }}</span> {{ importLabel }}
        </button>
        <button class="msg-import-btn append" :class="{ copied: appendLabel !== '追加编辑区' }" @click="appendToEditor">
          <span class="mso">{{ appendLabel === '追加编辑区' ? 'playlist_add' : 'check' }}</span> {{ appendLabel }}
        </button>
      </div>
    </div>

    <!-- 消息操作栏 -->
    <div v-if="showActions" class="msg-actions">
      <button class="msg-act-btn" @click="copyMessage" :title="copyLabel === 'check' ? '已复制' : '复制'">
        <span class="mso">{{ copyLabel }}</span>
      </button>
      <button v-if="role === 'user'" class="msg-act-btn" @click="emit('retry', index)" title="重新发送">
        <span class="mso">refresh</span>
      </button>
      <button class="msg-act-btn" @click="emit('delete', index)" title="删除">
        <span class="mso">delete_outline</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 代码块 */
:deep(.md-code) {
  border-radius: 8px; overflow: hidden;
  border: 1px solid var(--line); margin: 8px 0;
  background: var(--surface);
}
:deep(.md-code-head) {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 10px; background: var(--surface-alt);
  border-bottom: 1px solid var(--line);
}
:deep(.md-code-lang) { font-size: 11px; color: var(--ink3); font-weight: 600; }
:deep(.md-code-copy) {
  padding: 2px 10px; border: none; border-radius: 4px;
  background: var(--paper); color: var(--ink2);
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all .12s;
}
:deep(.md-code-copy:hover) { background: var(--olive); color: #fff; }
:deep(.md-code-copy.copied) { background: #4a7; color: #fff; }
:deep(.md-code pre) {
  margin: 0; padding: 12px; overflow-x: auto;
  font-size: 12px; line-height: 1.6;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
:deep(.md-code code) { background: none !important; padding: 0 !important; }

/* Markdown 内容 */
:deep(.msg-body h1),
:deep(.msg-body h2),
:deep(.msg-body h3) { margin: 12px 0 6px; font-weight: 700; color: var(--ink1); }
:deep(.msg-body h1) { font-size: 18px; }
:deep(.msg-body h2) { font-size: 16px; }
:deep(.msg-body h3) { font-size: 14px; }
:deep(.msg-body p) { margin: 4px 0; }
:deep(.msg-body ul),
:deep(.msg-body ol) { padding-left: 20px; margin: 4px 0; }
:deep(.msg-body li) { margin: 2px 0; }
:deep(.msg-body code) {
  background: rgba(107,142,35,.08); padding: 1px 5px; border-radius: 4px;
  font-size: 12px; font-family: 'SF Mono', monospace;
}
:deep(.msg-body blockquote) {
  border-left: 3px solid var(--olive); margin: 8px 0;
  padding: 4px 12px; color: var(--ink2); background: rgba(107,142,35,.03);
}
:deep(.msg-body table) {
  border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px;
}
:deep(.msg-body th),
:deep(.msg-body td) {
  border: 1px solid var(--line); padding: 6px 10px; text-align: left;
}
:deep(.msg-body th) { background: var(--surface-alt); font-weight: 600; }
:deep(.msg-body a) { color: var(--olive); text-decoration: underline; }
:deep(.msg-body hr) { border: none; border-top: 1px solid var(--line); margin: 12px 0; }

/* 导入按钮组 */
.msg-import-group {
  display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;
}
.msg-import-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px;
  border: 1px dashed var(--olive); border-radius: 6px;
  background: rgba(107,142,35,.04); color: var(--olive);
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all .12s;
}
.msg-import-btn:hover { background: var(--olive); color: #fff; border-style: solid; }
.msg-import-btn.copied { background: #4a7; color: #fff; border-color: #4a7; border-style: solid; }
.msg-import-btn.append { border-color: #2196f3; color: #2196f3; background: rgba(33,150,243,.04); }
.msg-import-btn.append:hover { background: #2196f3; color: #fff; }
.msg-import-btn.append.copied { background: #4a7; color: #fff; border-color: #4a7; }
.msg-import-btn .mso { font-size: 16px; }

/* 操作栏 */
.msg-actions {
  display: flex; gap: 2px; margin-top: 4px; padding-left: 36px;
  animation: fade-in .15s ease;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.msg-act-btn {
  padding: 3px 6px; border: none; border-radius: 4px;
  background: transparent; color: var(--ink3); cursor: pointer;
  transition: all .1s;
}
.msg-act-btn:hover { background: var(--surface); color: var(--ink1); }
.msg-act-btn .mso { font-size: 16px; }
</style>
