<script setup lang="ts">
/**
 * EditorPanel — Tiptap 富文本编辑区（AI 工作台）
 *
 * 替换原来的 contenteditable blocks 方案
 * 功能:
 *   1. 完整富文本编辑（标题/粗体/列表/引用/代码块/图片/链接）
 *   2. 选中文本后的悬浮 AI 工具条（润色/扩写/缩写/提炼）
 *   3. 搭子内容导入/追加
 *   4. 撤销/重做/字数统计/导出
 */
import { ref, computed, onBeforeUnmount, onMounted, watch, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { useNotebook } from '@/composables/useNotebook'
import { onEvent } from '@/utils/eventBus'
import { useChat } from '@/composables/useChat'
import { useAgentStore } from '@/stores/agentStore'

const { docTitle, load, save, blocks, addAgentBlock, clearAll } = useNotebook()
const { sendMessage, isStreaming } = useChat()
const agentStore = useAgentStore()

// ─── Tiptap 编辑器 ───
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Link.configure({ openOnClick: false }),
    Image.configure({ inline: false }),
    Placeholder.configure({
      placeholder: '开始写作... 选中文本可调用 AI 工具',
    }),
    CharacterCount,
  ],
  content: '',
  editorProps: {
    attributes: {
      class: 'tiptap-editor',
    },
  },
  onUpdate: ({ editor: e }) => {
    // 持久化到 localStorage
    try {
      localStorage.setItem('jc_tiptap_doc', JSON.stringify({
        title: docTitle.value,
        content: e.getJSON(),
        text: e.getText(),
      }))
    } catch { /* noop */ }
  },
  onSelectionUpdate: () => {
    // 选中文本时显示 AI 工具条
    updateBubblePosition()
  },
})

// 初始加载
function loadFromStorage() {
  try {
    const raw = localStorage.getItem('jc_tiptap_doc')
    if (raw) {
      const data = JSON.parse(raw)
      if (data.title) docTitle.value = data.title
      if (data.content && editor.value) {
        editor.value.commands.setContent(data.content)
      }
    } else {
      // 迁移旧数据：把旧 blocks 合并成一个文档
      load()
      if (blocks.value.length > 0) {
        const markdown = blocks.value.map(b => {
          if (b.type === 'agent') {
            return `> **${b.agentName || '搭子'}** · ${new Date(b.ts).toLocaleTimeString()}\n\n${b.content}`
          }
          return b.content
        }).join('\n\n---\n\n')
        editor.value?.commands.setContent(`<p>${markdown.replace(/\n/g, '<br>')}</p>`)
      }
    }
  } catch { /* noop */ }
}

// 等编辑器就绪后加载
const checkReady = setInterval(() => {
  if (editor.value) {
    loadFromStorage()
    clearInterval(checkReady)
  }
}, 50)
setTimeout(() => clearInterval(checkReady), 5000) // 安全退出

// ─── 文件重命名同步 ───
const offFileRenamed = onEvent('file-renamed', (payload: any) => {
  if (docTitle.value === payload.oldName) {
    docTitle.value = payload.newName
  }
})
onBeforeUnmount(() => {
  offFileRenamed()
})

// ─── 接收"导入编辑区"事件 ───
const offImport = onEvent('import-to-editor', (payload: any) => {
  if (editor.value && payload?.content) {
    // 在文档末尾追加内容
    const chain = editor.value.chain().focus()
    chain.setTextSelection(editor.value.state.doc.content.size)
    chain.insertContent(`
      <hr>
      <blockquote><p><strong>${payload.agentName || '助手'}</strong> · ${new Date().toLocaleTimeString()}</p></blockquote>
      <p>${(payload.content as string).replace(/\n/g, '<br>')}</p>
    `)
    chain.run()
  }
})
onBeforeUnmount(() => { offImport() })

// ─── 字数统计 ───
const wordCount = computed(() => {
  return editor.value?.storage.characterCount.characters() || 0
})

// ─── 工具栏操作 ───
function setHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run()
}

function toggleBold() { editor.value?.chain().focus().toggleBold().run() }
function toggleItalic() { editor.value?.chain().focus().toggleItalic().run() }
function toggleUnderline() { editor.value?.chain().focus().toggleUnderline().run() }
function toggleStrike() { editor.value?.chain().focus().toggleStrike().run() }
function toggleBulletList() { editor.value?.chain().focus().toggleBulletList().run() }
function toggleOrderedList() { editor.value?.chain().focus().toggleOrderedList().run() }
function toggleBlockquote() { editor.value?.chain().focus().toggleBlockquote().run() }
function toggleCodeBlock() { editor.value?.chain().focus().toggleCodeBlock().run() }
function insertHR() { editor.value?.chain().focus().setHorizontalRule().run() }
function undo() { editor.value?.chain().focus().undo().run() }
function redo() { editor.value?.chain().focus().redo().run() }

function insertLink() {
  const url = window.prompt('输入链接地址', 'https://')
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run()
  }
}

function insertImage() {
  const url = window.prompt('输入图片地址', 'https://')
  if (url) {
    editor.value?.chain().focus().setImage({ src: url }).run()
  }
}

// ─── 导出 ───
function exportDoc() {
  const text = editor.value?.getText() || ''
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (docTitle.value || '文档').replace(/[/\\:*?"<>|]/g, '_') + '.md'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 清空 ───
function clearDoc() {
  if (!confirm('确定清空文档？')) return
  editor.value?.commands.clearContent()
  docTitle.value = '正文'
  localStorage.removeItem('jc_tiptap_doc')
}

// ─── 悬浮 AI 工具 ───
const aiLoading = ref(false)
const aiAction = ref('')
const showBubble = ref(false)
const bubbleStyle = ref({ top: '0px', left: '0px' })

function updateBubblePosition() {
  if (!editor.value) return
  const { from, to } = editor.value.state.selection
  if (from === to) {
    showBubble.value = false
    return
  }
  // 获取选区 DOM 位置
  const view = editor.value.view
  const start = view.coordsAtPos(from)
  const editorEl = view.dom.closest('.ep-content')
  if (!editorEl) return
  const rect = editorEl.getBoundingClientRect()
  bubbleStyle.value = {
    top: (start.top - rect.top - 44) + 'px',
    left: Math.max(0, (start.left - rect.left)) + 'px',
  }
  showBubble.value = true
}

async function aiToolAction(action: string) {
  if (!editor.value || aiLoading.value) return
  const { from, to } = editor.value.state.selection
  const selectedText = editor.value.state.doc.textBetween(from, to, '\n')
  if (!selectedText.trim()) return

  const prompts: Record<string, string> = {
    '润色': `请润色以下文本，使其更流畅优美，保持原意，直接输出润色后的结果，不要加任何解释：\n\n${selectedText}`,
    '扩写': `请将以下文本扩写为更详细、更丰富的版本，保持原意，直接输出扩写结果：\n\n${selectedText}`,
    '缩写': `请将以下文本精简缩写为更简洁的版本，保留核心信息，直接输出缩写结果：\n\n${selectedText}`,
    '提炼': `请提炼以下文本的核心要点，以简洁的列表形式输出：\n\n${selectedText}`,
    '翻译': `请将以下文本翻译为英文（如果已是英文则翻译为中文），直接输出翻译结果：\n\n${selectedText}`,
    '续写': `请续写以下文本，保持风格和语气一致，直接输出续写内容：\n\n${selectedText}`,
  }

  const prompt = prompts[action]
  if (!prompt) return

  aiLoading.value = true
  aiAction.value = action

  try {
    // 通过 useChat 发送请求，但拦截结果用于编辑区
    await sendMessage(prompt, {
      systemPrompt: '你是一个专业的文本编辑助手。请直接输出处理后的结果，不要加任何前缀说明。',
      agentName: `AI ${action}`,
    })
  } finally {
    aiLoading.value = false
    aiAction.value = ''
  }
}

// ─── 查找替换 ───
const showFindReplace = ref(false)
const findQuery = ref('')
const replaceQuery = ref('')

function toggleFindReplace() {
  showFindReplace.value = !showFindReplace.value
}

function doFindReplace() {
  if (!findQuery.value || !editor.value) return
  const text = editor.value.getHTML()
  const count = (text.match(new RegExp(findQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  if (count > 0) {
    const newHtml = text.replaceAll(findQuery.value, replaceQuery.value)
    editor.value.commands.setContent(newHtml)
    alert(`已替换 ${count} 处`)
  } else {
    alert('未找到匹配内容')
  }
}
</script>

<template>
  <div class="ep">
    <!-- 顶部工具栏 -->
    <div class="ep-toolbar">
      <input
        v-model="docTitle"
        class="ep-title-input serif"
        placeholder="文档标题..."
      />
      <div class="ep-toolbar-divider"></div>

      <!-- 格式工具 -->
      <div class="ep-format-group">
        <button class="ep-fmt-btn" @click="setHeading(1)" :class="{ active: editor?.isActive('heading', { level: 1 }) }" title="标题1">
          H1
        </button>
        <button class="ep-fmt-btn" @click="setHeading(2)" :class="{ active: editor?.isActive('heading', { level: 2 }) }" title="标题2">
          H2
        </button>
        <button class="ep-fmt-btn" @click="setHeading(3)" :class="{ active: editor?.isActive('heading', { level: 3 }) }" title="标题3">
          H3
        </button>
      </div>
      <div class="ep-toolbar-divider"></div>

      <div class="ep-format-group">
        <button class="ep-fmt-btn" @click="toggleBold" :class="{ active: editor?.isActive('bold') }" title="粗体">
          <span class="mso">format_bold</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleItalic" :class="{ active: editor?.isActive('italic') }" title="斜体">
          <span class="mso">format_italic</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleUnderline" :class="{ active: editor?.isActive('underline') }" title="下划线">
          <span class="mso">format_underlined</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleStrike" :class="{ active: editor?.isActive('strike') }" title="删除线">
          <span class="mso">strikethrough_s</span>
        </button>
      </div>
      <div class="ep-toolbar-divider"></div>

      <div class="ep-format-group">
        <button class="ep-fmt-btn" @click="toggleBulletList" :class="{ active: editor?.isActive('bulletList') }" title="无序列表">
          <span class="mso">format_list_bulleted</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleOrderedList" :class="{ active: editor?.isActive('orderedList') }" title="有序列表">
          <span class="mso">format_list_numbered</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleBlockquote" :class="{ active: editor?.isActive('blockquote') }" title="引用">
          <span class="mso">format_quote</span>
        </button>
        <button class="ep-fmt-btn" @click="toggleCodeBlock" :class="{ active: editor?.isActive('codeBlock') }" title="代码块">
          <span class="mso">code</span>
        </button>
      </div>
      <div class="ep-toolbar-divider"></div>

      <div class="ep-format-group">
        <button class="ep-fmt-btn" @click="insertLink" title="插入链接">
          <span class="mso">link</span>
        </button>
        <button class="ep-fmt-btn" @click="insertImage" title="插入图片">
          <span class="mso">image</span>
        </button>
        <button class="ep-fmt-btn" @click="insertHR" title="分割线">
          <span class="mso">horizontal_rule</span>
        </button>
      </div>
      <div class="ep-toolbar-divider"></div>

      <div class="ep-format-group">
        <button class="ep-fmt-btn" @click="undo" title="撤销">
          <span class="mso">undo</span>
        </button>
        <button class="ep-fmt-btn" @click="redo" title="重做">
          <span class="mso">redo</span>
        </button>
      </div>

      <!-- 右侧工具 -->
      <div class="ep-toolbar-right">
        <span class="ep-word-count">{{ wordCount }} 字</span>
        <button class="ep-fmt-btn" @click="toggleFindReplace" title="查找替换">
          <span class="mso">search</span>
        </button>
        <button class="ep-fmt-btn" @click="exportDoc" title="导出">
          <span class="mso">download</span>
        </button>
        <button class="ep-fmt-btn danger" @click="clearDoc" title="清空">
          <span class="mso">delete_sweep</span>
        </button>
      </div>
    </div>

    <!-- 查找替换 -->
    <div v-if="showFindReplace" class="ep-find-bar">
      <input v-model="findQuery" placeholder="查找..." class="ep-find-input" />
      <input v-model="replaceQuery" placeholder="替换为..." class="ep-find-input" />
      <button class="ep-find-btn" @click="doFindReplace">全部替换</button>
      <button class="ep-find-close" @click="toggleFindReplace">
        <span class="mso">close</span>
      </button>
    </div>

    <!-- AI 处理中指示器 -->
    <div v-if="aiLoading" class="ep-ai-loading">
      <span class="mso ep-ai-spin">auto_fix_high</span>
      <span>AI {{ aiAction }}中...</span>
    </div>

    <!-- 悬浮 AI 工具条（选中文本后出现） -->
    <div v-if="showBubble && !aiLoading" class="ep-bubble-menu" :style="bubbleStyle">
      <button @click="aiToolAction('润色')" :disabled="aiLoading">✨ 润色</button>
      <button @click="aiToolAction('扩写')" :disabled="aiLoading">📝 扩写</button>
      <button @click="aiToolAction('缩写')" :disabled="aiLoading">✂️ 缩写</button>
      <button @click="aiToolAction('提炼')" :disabled="aiLoading">💡 提炼</button>
      <button @click="aiToolAction('续写')" :disabled="aiLoading">➡️ 续写</button>
      <button @click="aiToolAction('翻译')" :disabled="aiLoading">🌐 翻译</button>
    </div>

    <!-- 编辑器主体 -->
    <div class="ep-content">
      <EditorContent v-if="editor" :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
.ep {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

/* ─── 工具栏 ─── */
.ep-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-alt);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.ep-title-input {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink1);
  background: none;
  border: none;
  outline: none;
  width: 120px;
  font-family: inherit;
}
.ep-title-input::placeholder { color: var(--ink3); }

.ep-toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--line);
  margin: 0 2px;
  flex-shrink: 0;
}

.ep-format-group {
  display: flex;
  gap: 1px;
}

.ep-fmt-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink3);
  font-family: inherit;
  transition: all 0.12s;
}
.ep-fmt-btn:hover { background: var(--olive-pale); color: var(--olive-dark); }
.ep-fmt-btn.active { background: rgba(107,142,35,.15); color: var(--olive-dark); }
.ep-fmt-btn .mso { font-size: 16px; }
.ep-fmt-btn.danger:hover { color: #e53935; background: rgba(229,57,53,.06); }

.ep-toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ep-word-count {
  font-size: 11px;
  color: var(--ink3);
  padding-right: 4px;
}

/* ─── 查找替换 ─── */
.ep-find-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 16px; border-bottom: 1px solid var(--line);
  background: var(--surface-alt); flex-shrink: 0;
}
.ep-find-input {
  flex: 1; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px;
  font-size: 12px; outline: none; background: var(--surface); color: var(--ink);
  font-family: inherit;
}
.ep-find-btn {
  padding: 4px 10px; background: var(--olive); color: #fff; border: none;
  border-radius: 4px; cursor: pointer; font-size: 11px; font-family: inherit;
}
.ep-find-close { background: none; border: none; cursor: pointer; }
.ep-find-close .mso { font-size: 16px; color: var(--ink3); }

/* ─── AI 处理中 ─── */
.ep-ai-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(107,142,35,.06), rgba(213,199,135,.08));
  border-bottom: 1px solid rgba(107,142,35,.2);
  font-size: 13px; color: var(--olive-dark); font-weight: 600;
  animation: ai-pulse 1.5s ease infinite;
}
@keyframes ai-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }
.ep-ai-spin { animation: spin 2s linear infinite; font-size: 16px; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ─── 编辑器主体 ─── */
.ep-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* Tiptap 编辑区样式 */
:deep(.tiptap-editor) {
  padding: 32px 40px 120px;
  max-width: 780px;
  margin: 0 auto;
  outline: none;
  font-size: 15px;
  line-height: 1.8;
  color: var(--ink);
  min-height: 100%;
}

:deep(.tiptap-editor p) {
  margin: 4px 0;
}

:deep(.tiptap-editor h1) {
  font-size: 26px; font-weight: 800; margin: 24px 0 12px;
  color: var(--ink1); border-bottom: 2px solid var(--line); padding-bottom: 8px;
}
:deep(.tiptap-editor h2) {
  font-size: 20px; font-weight: 700; margin: 20px 0 8px; color: var(--ink1);
}
:deep(.tiptap-editor h3) {
  font-size: 16px; font-weight: 700; margin: 16px 0 6px; color: var(--ink1);
}

:deep(.tiptap-editor ul),
:deep(.tiptap-editor ol) {
  padding-left: 24px; margin: 8px 0;
}
:deep(.tiptap-editor li) { margin: 2px 0; }

:deep(.tiptap-editor blockquote) {
  border-left: 3px solid var(--olive);
  margin: 12px 0; padding: 8px 16px;
  color: var(--ink2); background: rgba(107,142,35,.03);
  border-radius: 0 8px 8px 0;
}

:deep(.tiptap-editor code) {
  background: rgba(107,142,35,.08); padding: 2px 6px; border-radius: 4px;
  font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace;
}

:deep(.tiptap-editor pre) {
  background: var(--surface-alt); border: 1px solid var(--line);
  border-radius: 8px; padding: 14px 18px; overflow-x: auto;
  margin: 12px 0;
}
:deep(.tiptap-editor pre code) {
  background: none !important; padding: 0 !important;
  font-size: 13px; line-height: 1.6;
}

:deep(.tiptap-editor hr) {
  border: none; border-top: 1px solid var(--line); margin: 20px 0;
}

:deep(.tiptap-editor img) {
  max-width: 100%; border-radius: 8px; margin: 12px 0;
  border: 1px solid var(--line);
}

:deep(.tiptap-editor a) {
  color: var(--olive); text-decoration: underline;
}

/* Placeholder */
:deep(.tiptap-editor p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--ink3);
  opacity: 0.5;
  pointer-events: none;
  height: 0;
  font-style: italic;
}

/* ─── 悬浮 AI 工具条 ─── */
.ep-bubble-menu {
  position: absolute;
  z-index: 50;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  animation: bubble-in .15s ease;
}
@keyframes bubble-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.ep-bubble-menu button {
  padding: 4px 10px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink2);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: all .12s;
}
.ep-bubble-menu button:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.ep-bubble-menu button:disabled {
  opacity: .4;
  cursor: wait;
}
</style>
