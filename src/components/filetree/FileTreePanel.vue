<script setup lang="ts">
/**
 * FileTreePanel — 我的搭子（Col 2）
 * 
 * 功能：
 * - 自建搭子平铺卡片（名称 + 关键词 + 描述 + 启用）
 * - 搜索框 + 粘贴导入
 * - 牛马开关（superpower 路由）真正接通 agentStore
 */
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'

const agentStore = useAgentStore()
const sessionStore = useSessionStore()

const searchQuery = ref('')

// 迁移 toast
const migrationToast = ref('')

onMounted(() => {
  sessionStore.loadAllSessions()
  if (agentStore.migrationCount > 0) {
    migrationToast.value = `已从旧版本导入 ${agentStore.migrationCount} 个搭子 ✨`
    setTimeout(() => { migrationToast.value = '' }, 5000)
  }
})

// 粘贴即导入 — 搜索框粘贴长文本自动创建搭子
function onSearchPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') || ''
  if (text.length > 50) {
    e.preventDefault()
    const skill = agentStore.importFromText(text)
    if (skill) {
      migrationToast.value = `已导入搭子「${skill.name}」 ✨`
      setTimeout(() => { migrationToast.value = '' }, 3000)
      searchQuery.value = ''
    }
  }
}

// JSON 批量导入
function importJSON() {
  const json = prompt('粘贴旧搭子 JSON 数组 (从旧版本导出):')
  if (!json) return
  const count = agentStore.importFromJSON(json)
  if (count > 0) {
    migrationToast.value = `成功导入 ${count} 个搭子 ✨`
    setTimeout(() => { migrationToast.value = '' }, 3000)
  } else {
    alert('导入失败，请检查 JSON 格式')
  }
}

// 自建搭子过滤
const customAgents = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return agentStore.agents
    .filter(a => a.source === 'user')
    .filter(a => !q || a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q))
})
</script>

<template>
  <div class="ft">
    <!-- Header -->
    <div class="ft-header">
      <span class="ft-title">我的搭子</span>
      <!-- 牛马开关 — 真正接通 agentStore.routerEnabled -->
      <button
        class="ft-niuma-toggle"
        :class="{ on: agentStore.routerEnabled }"
        @click="agentStore.toggleRouter()"
        title="牛马模式（自动路由搭子）"
      >
        <span class="ft-niuma-dot"></span>
        <span class="ft-niuma-label">牛马</span>
      </button>
    </div>

    <!-- Migration toast -->
    <div v-if="migrationToast" class="ft-toast">{{ migrationToast }}</div>

    <!-- Search (粘贴长文本自动导入搭子) -->
    <div class="ft-search">
      <span class="mso" style="font-size: 15px;">search</span>
      <input v-model="searchQuery" placeholder="搜索 / 粘贴提示词..." type="text"
             @paste="onSearchPaste" />
      <button class="ft-import-btn" @click="importJSON" title="导入旧搭子 JSON">
        <span class="mso" style="font-size: 14px;">upload</span>
      </button>
    </div>

    <!-- 自建搭子卡片平铺 -->
    <div class="ft-cards">
      <div v-for="a in customAgents" :key="a.id" class="ft-card"
           :class="{ active: agentStore.currentAgent?.id === a.id }"
           @click="agentStore.selectAgent(a.id)">
        <div class="ft-card-name">{{ a.name }}</div>
        <div class="ft-card-triggers" v-if="a.triggers?.length">
          <span v-for="t in a.triggers.slice(0, 3)" :key="t" class="ft-card-tag">{{ t }}</span>
        </div>
        <div class="ft-card-desc">{{ (a.description || '').slice(0, 40) }}</div>
      </div>
      <div v-if="customAgents.length === 0" class="ft-empty-card">
        <span class="mso" style="font-size:24px;color:var(--ink3)">add_circle_outline</span>
        <span>还没有自建搭子</span>
        <span class="ft-empty-hint">粘贴提示词或点击「创建搭子」开始</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ft { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--surface-alt); }
.ft-header {
  padding: 12px 12px 8px;
  display: flex; align-items: center; justify-content: space-between;
}
.ft-title { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); flex: 1; }

/* 牛马药丸开关 — 圆点左=关 右=开 */
.ft-niuma-toggle {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 4px; border-radius: 20px; min-width: 52px;
  border: 1px solid var(--border); background: var(--surface);
  cursor: pointer; font-family: inherit; transition: all .25s;
}
.ft-niuma-toggle:hover { border-color: var(--olive); }
.ft-niuma-toggle.on { background: var(--olive); border-color: var(--olive); flex-direction: row-reverse; }
.ft-niuma-dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--ink3); opacity: .3; transition: all .25s; flex-shrink: 0;
}
.ft-niuma-toggle.on .ft-niuma-dot { background: #fff; opacity: 1; }
.ft-niuma-label {
  font-size: 10px; font-weight: 700; color: var(--ink3); line-height: 1; padding: 0 2px;
}
.ft-niuma-toggle.on .ft-niuma-label { color: #fff; }

.ft-search { padding: 4px 10px 8px; display: flex; align-items: center; gap: 6px; }
.ft-search .mso { color: var(--ink3); flex-shrink: 0; }
.ft-search input {
  width: 100%; border: 1px solid var(--border); background: var(--surface);
  border-radius: 8px; padding: 6px 8px; font-size: 12px; color: var(--ink); outline: none; font-family: inherit;
}
.ft-search input:focus { border-color: var(--olive); }

/* 卡片平铺 */
.ft-cards {
  flex: 1; overflow-y: auto; padding: 4px 8px 60px;
  display: flex; flex-direction: column; gap: 6px;
}
.ft-card {
  padding: 10px 12px; border-radius: 10px;
  border: 1.5px solid var(--line); background: var(--surface);
  cursor: pointer; transition: all .15s;
}
.ft-card:hover { border-color: var(--olive); box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.ft-card.active { border-color: var(--olive); background: rgba(107,142,35,.06); }
.ft-card-name { font-size: 13px; font-weight: 700; color: var(--ink1); margin-bottom: 3px; }
.ft-card-triggers { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 3px; }
.ft-card-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(213,199,135,.12); color: var(--olive-dark); font-weight: 600;
}
.ft-card-desc {
  font-size: 11px; color: var(--ink3); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ft-empty-card {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 24px 12px; color: var(--ink3); font-size: 12px;
}
.ft-empty-hint { font-size: 10px; color: var(--ink3); opacity: .6; }

/* 迁移 toast */
.ft-toast {
  margin: 0 10px 6px; padding: 8px 12px; border-radius: 8px;
  background: var(--olive); color: #fff; font-size: 12px; font-weight: 600;
  text-align: center; animation: toast-in 0.3s ease;
}
@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* 导入按钮 */
.ft-import-btn {
  width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink3); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ft-import-btn:hover { color: var(--olive-dark); border-color: var(--olive); }
</style>
