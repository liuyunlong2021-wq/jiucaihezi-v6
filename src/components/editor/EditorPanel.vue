<script setup lang="ts">
/**
 * EditorPanel — 正文编辑区
 * 搬迁自 code.html L1286-1312 + L10870-11163
 */
import { onMounted, nextTick } from 'vue'
import { useNotebook } from '@/composables/useNotebook'

const {
  blocks, docTitle, showFindReplace, findQuery, replaceQuery,
  wordCount, isEmpty,
  addUserBlock, updateBlock, deleteBlock, clearAll,
  toggleFindReplace, doFindReplace, exportNotebook, load,
} = useNotebook()

function onBlockInput(id: string, e: Event) {
  const el = e.target as HTMLDivElement
  updateBlock(id, el.innerText)
}

async function handleAddBlock() {
  const blockId = addUserBlock()
  await nextTick()
  const el = document.querySelector(`[data-block="${blockId}"] .nb-block-body`) as HTMLElement
  if (el) el.focus()
}

function onFindReplace() {
  const count = doFindReplace()
  if (count !== undefined) {
    alert(`已替换 ${count} 处`)
  }
}

onMounted(() => load())
</script>

<template>
  <div class="ep">
    <!-- 工具栏 -->
    <div class="ep-toolbar">
      <span class="nb-title serif">{{ docTitle }}</span>
      <button class="ep-btn" @click="handleAddBlock" title="添加文本块">
        <span class="mso">note_add</span>
      </button>
      <button class="ep-btn" @click="exportNotebook" title="导出">
        <span class="mso">download</span>
      </button>
      <div style="margin-left:auto; display:flex; align-items:center; gap:10px;">
        <span class="ep-word-count">{{ wordCount }} 字</span>
        <button class="ep-btn" @click="toggleFindReplace" title="查找替换">
          <span class="mso">search</span>
        </button>
      </div>
    </div>

    <!-- 查找替换 -->
    <div v-if="showFindReplace" class="ep-find-bar">
      <input v-model="findQuery" placeholder="查找..." class="ep-find-input" />
      <input v-model="replaceQuery" placeholder="替换为..." class="ep-find-input" />
      <button class="ep-find-btn" @click="onFindReplace">全部替换</button>
      <button class="ep-find-close" @click="toggleFindReplace">
        <span class="mso">close</span>
      </button>
    </div>

    <!-- 正文 -->
    <div class="ep-content">
      <!-- 空状态 -->
      <div v-if="isEmpty" class="nb-welcome">
        <h2 class="serif">正文编辑区</h2>
        <p>这里独立处理文稿。<br/>点击上方 + 添加文本块开始编辑。</p>
      </div>

      <!-- 块列表 -->
      <div v-for="b in blocks" :key="b.id" class="nb-block" :class="{ 'user-block': b.type === 'user' }" :data-block="b.id">
        <div v-if="b.type === 'agent'" class="nb-block-head">
          <span class="mso" style="font-size:14px; color:var(--olive);">smart_toy</span>
          <span class="nb-agent-name">{{ b.agentName || '搭子' }}</span>
          <span class="nb-block-ts">{{ new Date(b.ts).toLocaleTimeString() }}</span>
        </div>
        <div class="nb-block-body" :contenteditable="true" @input="onBlockInput(b.id, $event)"
             v-text="b.content" />
        <div class="nb-block-actions">
          <button class="nb-act-btn" @click="deleteBlock(b.id)" title="删除">
            <span class="mso">delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ep { display: flex; flex-direction: column; height: 100%; background: var(--surface); }

/* Toolbar */
.ep-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}
.nb-title { font-size: 15px; font-weight: 700; color: var(--ink1); }
.ep-btn {
  width: 28px; height: 28px; border: none; background: none;
  border-radius: 6px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.ep-btn .mso { font-size: 16px; color: var(--ink3); }
.ep-btn:hover { background: var(--olive-pale); }
.ep-btn:hover .mso { color: var(--olive-dark); }
.ep-word-count { font-size: 11px; color: var(--ink3); }

/* Find/Replace */
.ep-find-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 16px; border-bottom: 1px solid var(--line); background: var(--surface-alt);
}
.ep-find-input {
  flex: 1; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px;
  font-size: 12px; outline: none; background: var(--surface); color: var(--ink); font-family: inherit;
}
.ep-find-btn {
  padding: 4px 10px; background: var(--olive); color: #fff; border: none;
  border-radius: 4px; cursor: pointer; font-size: 11px; font-family: inherit;
}
.ep-find-close {
  background: none; border: none; cursor: pointer;
}
.ep-find-close .mso { font-size: 16px; color: var(--ink3); }

/* Content */
.ep-content {
  flex: 1; overflow-y: auto; padding: 20px 28px 100px;
  max-width: 780px; margin: 0 auto; width: 100%;
}
.nb-welcome {
  text-align: center; color: var(--ink3); padding: 60px 20px;
}
.nb-welcome h2 { font-size: 20px; color: var(--ink1); margin-bottom: 8px; }
.nb-welcome p { font-size: 13px; line-height: 1.8; }

/* Blocks */
.nb-block {
  position: relative; margin-bottom: 12px; border-radius: 10px;
  border: 1px solid transparent; padding: 10px 14px; transition: border-color .12s;
}
.nb-block:hover { border-color: var(--line); }
.nb-block.user-block { background: rgba(120,120,120,.02); }
.nb-block-head {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.nb-agent-name { font-size: 12px; font-weight: 600; color: var(--olive-dark); }
.nb-block-ts { font-size: 10px; color: var(--ink3); margin-left: auto; }
.nb-block-body {
  font-size: 14px; line-height: 1.8; color: var(--ink); outline: none;
  min-height: 24px; white-space: pre-wrap; word-break: break-word;
}
.nb-block-actions {
  position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .12s;
}
.nb-block:hover .nb-block-actions { opacity: 1; }
.nb-act-btn {
  width: 24px; height: 24px; border: none; background: rgba(0,0,0,.04);
  border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.nb-act-btn .mso { font-size: 14px; color: var(--ink3); }
.nb-act-btn:hover { background: rgba(200,0,0,.08); }
.nb-act-btn:hover .mso { color: #c00; }
</style>
