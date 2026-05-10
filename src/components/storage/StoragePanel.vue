<script setup lang="ts">
/**
 * StoragePanel — 存储空间
 * 文本 / 图片 / 视频 / 知识库 四个 tab
 * 知识库使用 IndexedDB 虚拟文件系统
 */
import { ref, computed, onMounted } from 'vue'
import { cpState } from '@/composables/useCreation'
import { useNotebook } from '@/composables/useNotebook'

type Tab = 'text' | 'image' | 'video' | 'wiki'
const activeTab = ref<Tab>('text')

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'text', label: '文本', icon: 'description' },
  { key: 'image', label: '图片', icon: 'image' },
  { key: 'video', label: '视频', icon: 'movie' },
  { key: 'wiki', label: '知识库', icon: 'auto_stories' },
]

// 从创作面板结果中获取图片/视频
const imageResults = computed(() =>
  cpState.results.filter(r => r.type === 'image')
)
const videoResults = computed(() =>
  cpState.results.filter(r => r.type === 'video')
)

// 文本文件：从 notebook 导出的内容
const { blocks } = useNotebook()
const textItems = computed(() =>
  blocks.value.filter(b => b.content.trim()).map(b => ({
    id: b.id,
    title: b.content.slice(0, 30) + (b.content.length > 30 ? '...' : ''),
    source: b.agentName || '手动输入',
    ts: b.ts,
  }))
)

// ─── 知识库 (IndexedDB 虚拟文件系统) ───
interface WikiEntry {
  path: string
  type: 'folder' | 'file'
  ts: number
  size?: number
}

const wikiEntries = ref<WikiEntry[]>([])
const wikiInitialized = ref(false)

onMounted(() => {
  const init = localStorage.getItem('jc_wiki_init')
  wikiInitialized.value = init === 'true'
  if (wikiInitialized.value) loadWikiStructure()
})

function initWiki() {
  // 初始化知识库虚拟目录结构
  const defaultEntries: WikiEntry[] = [
    { path: 'raw/', type: 'folder', ts: Date.now() },
    { path: 'wiki/', type: 'folder', ts: Date.now() },
    { path: 'wiki/index.md', type: 'file', ts: Date.now(), size: 0 },
    { path: 'wiki/log.md', type: 'file', ts: Date.now(), size: 0 },
  ]
  localStorage.setItem('jc_wiki_entries', JSON.stringify(defaultEntries))
  localStorage.setItem('jc_wiki_init', 'true')
  wikiEntries.value = defaultEntries
  wikiInitialized.value = true
}

function loadWikiStructure() {
  try {
    const raw = localStorage.getItem('jc_wiki_entries')
    wikiEntries.value = raw ? JSON.parse(raw) : []
  } catch { wikiEntries.value = [] }
}

function getIcon(entry: WikiEntry): string {
  if (entry.type === 'folder') return 'folder'
  if (entry.path.endsWith('.md')) return 'article'
  return 'insert_drive_file'
}
</script>

<template>
  <div class="sp">
    <div class="sp-head">
      <h3>存储空间</h3>
    </div>

    <!-- Tabs -->
    <div class="sp-tabs">
      <button v-for="t in tabs" :key="t.key" class="sp-tab"
              :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
        <span class="mso">{{ t.icon }}</span>
        {{ t.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="sp-body">
      <!-- 文本 -->
      <template v-if="activeTab === 'text'">
        <div v-if="textItems.length" class="sp-list">
          <div v-for="item in textItems" :key="item.id" class="sp-text-item">
            <span class="mso sp-item-icon">description</span>
            <div class="sp-item-body">
              <div class="sp-item-title">{{ item.title }}</div>
              <div class="sp-item-meta">{{ item.source }} · {{ new Date(item.ts).toLocaleDateString() }}</div>
            </div>
          </div>
        </div>
        <div v-else class="sp-empty">
          <span class="mso" style="font-size: 40px;">drafts</span>
          <p>存储空间中无文本文件</p>
        </div>
      </template>

      <!-- 图片 -->
      <template v-if="activeTab === 'image'">
        <div v-if="imageResults.length" class="sp-grid">
          <div v-for="(r, i) in imageResults" :key="i" class="sp-img-card">
            <img :src="r.url" alt="" />
            <div class="sp-img-meta">{{ r.model }} · {{ new Date(r.ts).toLocaleDateString() }}</div>
          </div>
        </div>
        <div v-else class="sp-empty">
          <span class="mso" style="font-size: 40px;">image</span>
          <p>存储空间中无图片文件</p>
          <p class="sp-empty-hint">在创作面板生成的图片会自动归档到这里</p>
        </div>
      </template>

      <!-- 视频 -->
      <template v-if="activeTab === 'video'">
        <div v-if="videoResults.length" class="sp-grid">
          <div v-for="(r, i) in videoResults" :key="i" class="sp-vid-card">
            <video :src="r.url" controls />
            <div class="sp-img-meta">{{ r.model }} · {{ new Date(r.ts).toLocaleDateString() }}</div>
          </div>
        </div>
        <div v-else class="sp-empty">
          <span class="mso" style="font-size: 40px;">movie</span>
          <p>存储空间中无视频文件</p>
          <p class="sp-empty-hint">在创作面板生成的视频会自动归档到这里</p>
        </div>
      </template>

      <!-- 知识库 -->
      <template v-if="activeTab === 'wiki'">
        <div v-if="!wikiInitialized" class="sp-wiki-init">
          <span class="mso" style="font-size: 48px; color: var(--olive);">auto_stories</span>
          <h4>初始化知识库</h4>
          <p>知识库将建立以下虚拟目录结构：</p>
          <div class="sp-wiki-preview">
            <code>
根目录/<br/>
├── raw/ &nbsp;&nbsp;&nbsp;← 原始素材（带时间戳）<br/>
├── wiki/ &nbsp;&nbsp;← 编译后的知识页<br/>
│ &nbsp;&nbsp;├── 主题文件夹/<br/>
│ &nbsp;&nbsp;├── index.md ← 全局目录<br/>
│ &nbsp;&nbsp;└── log.md &nbsp;&nbsp;← 操作日志
            </code>
          </div>
          <button class="sp-wiki-init-btn" @click="initWiki">
            <span class="mso">rocket_launch</span> 初始化知识库
          </button>
        </div>
        <div v-else class="sp-wiki-tree">
          <div class="sp-wiki-status">
            <span class="mso" style="font-size: 14px; color: var(--olive);">check_circle</span>
            知识库已就绪
          </div>
          <div v-for="entry in wikiEntries" :key="entry.path" class="sp-wiki-entry"
               :class="{ 'is-folder': entry.type === 'folder' }">
            <span class="mso sp-wiki-icon">{{ getIcon(entry) }}</span>
            <span class="sp-wiki-path">{{ entry.path }}</span>
            <span v-if="entry.type === 'file' && entry.size !== undefined" class="sp-wiki-size">
              {{ entry.size > 0 ? Math.round(entry.size / 1024) + 'KB' : '空' }}
            </span>
          </div>
          <div class="sp-wiki-hint">
            开启「学习」开关后，对话内容将自动摄入知识库
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sp { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.sp-head { padding: 16px; border-bottom: 1px solid var(--line); }
.sp-head h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }

.sp-tabs { display: flex; border-bottom: 1px solid var(--line); padding: 0 12px; }
.sp-tab {
  display: flex; align-items: center; gap: 4px; padding: 10px 12px;
  border: none; background: none; font-size: 12px; color: var(--ink3);
  cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit; transition: all .12s;
}
.sp-tab:hover { color: var(--ink1); }
.sp-tab.active { color: var(--olive-dark); border-bottom-color: var(--olive); font-weight: 600; }
.sp-tab .mso { font-size: 16px; }

.sp-body { flex: 1; overflow-y: auto; padding: 12px; }

.sp-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; height: 300px; color: var(--ink3); text-align: center;
}
.sp-empty .mso { color: rgba(120,120,120,.2); }
.sp-empty p { font-size: 13px; }
.sp-empty-hint { font-size: 11px !important; color: var(--ink3); }

.sp-list { display: flex; flex-direction: column; gap: 4px; }
.sp-text-item {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-radius: 8px; cursor: pointer; transition: background .12s;
}
.sp-text-item:hover { background: var(--olive-pale); }
.sp-item-icon { font-size: 18px; color: var(--ink3); }
.sp-item-body { flex: 1; min-width: 0; }
.sp-item-title { font-size: 13px; color: var(--ink1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-item-meta { font-size: 11px; color: var(--ink3); margin-top: 2px; }

.sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.sp-img-card, .sp-vid-card { border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
.sp-img-card img, .sp-vid-card video { width: 100%; display: block; }
.sp-img-meta { padding: 6px 8px; font-size: 10px; color: var(--ink3); }

/* 知识库 */
.sp-wiki-init {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 40px 20px; text-align: center;
}
.sp-wiki-init h4 { font-size: 16px; font-weight: 700; color: var(--ink1); margin: 0; }
.sp-wiki-init p { font-size: 13px; color: var(--ink3); margin: 0; }
.sp-wiki-preview {
  background: var(--surface-alt); border-radius: 10px; padding: 16px;
  font-size: 12px; color: var(--ink2); text-align: left; line-height: 1.8;
  border: 1px solid var(--line);
}
.sp-wiki-preview code { font-family: 'Menlo', monospace; }
.sp-wiki-init-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 24px; border: none; border-radius: 10px;
  background: var(--olive); color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: inherit; margin-top: 8px;
}
.sp-wiki-init-btn:hover { transform: scale(1.03); }
.sp-wiki-tree { display: flex; flex-direction: column; gap: 2px; }
.sp-wiki-status {
  display: flex; align-items: center; gap: 6px; padding: 8px 12px;
  font-size: 12px; font-weight: 600; color: var(--olive-dark);
  background: var(--olive-pale); border-radius: 8px; margin-bottom: 8px;
}
.sp-wiki-entry {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  font-size: 12px; color: var(--ink2); border-radius: 6px; cursor: pointer;
}
.sp-wiki-entry:hover { background: var(--olive-pale); }
.sp-wiki-entry.is-folder { font-weight: 600; color: var(--ink1); }
.sp-wiki-icon { font-size: 16px; color: var(--ink3); }
.sp-wiki-path { flex: 1; }
.sp-wiki-size { font-size: 10px; color: var(--ink3); }
.sp-wiki-hint {
  margin-top: 16px; padding: 10px 12px; border-radius: 8px;
  background: rgba(120,120,120,.04); font-size: 11px; color: var(--ink3);
  text-align: center;
}
</style>
