<script setup lang="ts">
/**
 * HistoryPanel — 对话记录面板 (Col 3)
 * 源自 code.html #history-col (行 1068-1075)
 */
import { onMounted, computed, ref } from 'vue'
import { useSessionStore } from '@/stores/sessionStore'
import { useAgentStore } from '@/stores/agentStore'

const sessionStore = useSessionStore()
const agentStore = useAgentStore()
const searchQuery = ref('')

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
  sessionStore.loadSession(id)
}

function newChat() {
  agentStore.deselectAgent()
}

onMounted(() => {
  sessionStore.loadAllSessions()
})
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
</style>
