<script setup lang="ts">
/**
 * HistoryPanel — 对话记录面板 (Col 3)
 */
import { onMounted, computed, ref } from 'vue'
import { useSessionStore } from '@/stores/sessionStore'
import { useAgentStore } from '@/stores/agentStore'

const sessionStore = useSessionStore()
const agentStore = useAgentStore()
const searchQuery = ref('')
const ctxMenu = ref({ show: false, x: 0, y: 0, sessionId: '', title: '' })

const filteredSessions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = sessionStore.sessions || []
  if (!q) return list
  return list.filter(s =>
    (s.title || '').toLowerCase().includes(q) ||
    (s.agentId || '').toLowerCase().includes(q)
  )
})

function openSession(id: string) {
  sessionStore.switchSession(id)
}

function newChat() {
  agentStore.selectAgent(null)
  sessionStore.switchSession('')
}

onMounted(() => {
  sessionStore.loadAllSessions()
})

function openCtxMenu(e: MouseEvent, s: any) {
  e.preventDefault()
  ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, sessionId: s.id, title: s.title || '' }
}
function closeCtxMenu() { ctxMenu.value.show = false }

function renameSession() {
  const newTitle = prompt('重命名对话', ctxMenu.value.title)
  closeCtxMenu()
  if (newTitle && newTitle !== ctxMenu.value.title) {
    sessionStore.renameSession(ctxMenu.value.sessionId, newTitle)
  }
}
function deleteSession() {
  closeCtxMenu()
  if (!confirm('确定删除这条对话记录？')) return
  sessionStore.deleteSession(ctxMenu.value.sessionId)
}
</script>

<template>
  <div class="hp">
    <div class="hp-header">
      <h3>对话记录</h3>
      <button class="hp-new-btn" @click="newChat" title="新建对话">
        <span class="mso">add</span>
      </button>
    </div>
    <div class="hp-search">
      <span class="mso hp-search-icon">search</span>
      <input
        v-model="searchQuery"
        type="search"
        placeholder="搜索对话..."
        class="hp-search-input"
      />
    </div>
    <div class="hp-list">
      <div
        v-for="s in filteredSessions"
        :key="s.id"
        class="hp-item"
        @click="openSession(s.id)"
        @contextmenu="openCtxMenu($event, s)"
      >
        <span class="mso hp-item-icon">chat_bubble</span>
        <div class="hp-item-body">
          <div class="hp-item-title">{{ s.title || '无主题对话' }}</div>
          <div class="hp-item-time">{{ new Date(s.updatedAt || s.createdAt).toLocaleDateString() }}</div>
        </div>
      </div>
      <div v-if="filteredSessions.length === 0" class="hp-empty">
        <span class="mso" style="font-size: 28px;">forum</span>
        <p>暂无对话记录</p>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="ctxMenu.show" class="hp-ctx-overlay" @click="closeCtxMenu">
        <div class="hp-ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
          <button class="hp-ctx-item" @click="renameSession"><span class="mso">edit</span> 重命名</button>
          <button class="hp-ctx-item danger" @click="deleteSession"><span class="mso">delete</span> 删除</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.hp {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}
.hp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.hp-header h3 { font-size: 13px; font-weight: 700; color: var(--ink1); margin: 0; }
.hp-new-btn {
  width: 28px; height: 28px; border: none; background: none;
  border-radius: 8px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.hp-new-btn .mso { font-size: 18px; color: var(--ink3); }
.hp-new-btn:hover { background: var(--olive-pale); }
.hp-new-btn:hover .mso { color: var(--olive-dark); }
.hp-search {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-bottom: 1px solid var(--line);
}
.hp-search-icon { font-size: 16px; color: var(--ink3); }
.hp-search-input {
  flex: 1; border: none; background: none; font-size: 12px;
  color: var(--ink); outline: none; font-family: inherit;
}
.hp-list { flex: 1; overflow-y: auto; padding: 6px; }
.hp-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 10px; border-radius: 8px;
  cursor: pointer; transition: background .12s;
}
.hp-item:hover { background: var(--olive-pale); }
.hp-item-icon { font-size: 16px; color: var(--ink3); }
.hp-item-body { flex: 1; min-width: 0; }
.hp-item-title {
  font-size: 13px; font-weight: 500; color: var(--ink1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hp-item-time { font-size: 11px; color: var(--ink3); margin-top: 2px; }
.hp-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; height: 200px; color: var(--ink3);
}
.hp-empty p { font-size: 12px; }
/* 右键菜单 */
.hp-ctx-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.1); }
.hp-ctx-menu { position: fixed; min-width: 140px; padding: 6px; background: #fff; border: 2px solid #ddd; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 10000; }
.hp-ctx-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 12px; border: none; border-radius: 6px; background: transparent; color: var(--ink1); font-size: 12px; cursor: pointer; font-family: inherit; }
.hp-ctx-item:hover { background: #f5f5f5; }
.hp-ctx-item.danger:hover { color: #e53935; }
.hp-ctx-item .mso { font-size: 16px; color: var(--ink2); }
</style>
