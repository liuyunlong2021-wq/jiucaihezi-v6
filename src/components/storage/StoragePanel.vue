<script setup lang="ts">
/**
 * StoragePanel — 存储空间
 * 文本 / 图片 / 视频 三个 tab
 */
import { ref, computed } from 'vue'
import { cpState } from '@/composables/useCreation'
import { useNotebook } from '@/composables/useNotebook'

type Tab = 'text' | 'image' | 'video'
const activeTab = ref<Tab>('text')

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'text', label: '文本文件', icon: 'description' },
  { key: 'image', label: '图片文件', icon: 'image' },
  { key: 'video', label: '视频文件', icon: 'movie' },
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
    </div>
  </div>
</template>

<style scoped>
.sp { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.sp-head { padding: 16px; border-bottom: 1px solid var(--line); }
.sp-head h3 { font-size: 15px; font-weight: 700; color: var(--ink1); margin: 0; }

.sp-tabs {
  display: flex; border-bottom: 1px solid var(--line); padding: 0 12px;
}
.sp-tab {
  display: flex; align-items: center; gap: 4px; padding: 10px 14px;
  border: none; background: none; font-size: 13px; color: var(--ink3);
  cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit;
  transition: all .12s;
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
.sp-img-card, .sp-vid-card {
  border-radius: 8px; overflow: hidden; border: 1px solid var(--line);
}
.sp-img-card img, .sp-vid-card video { width: 100%; display: block; }
.sp-img-meta { padding: 6px 8px; font-size: 10px; color: var(--ink3); }
</style>
