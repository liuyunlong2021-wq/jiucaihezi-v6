<script setup lang="ts">
/**
 * ActivityRail — 左侧图标导航栏
 * 源自 code.html #activity-bar (行 48-58, 990-1043)
 */
defineProps<{
  active: string
}>()

const emit = defineEmits<{
  (e: 'switch', mode: string): void
}>()

const tabs = [
  { key: 'chat', icon: 'chat_bubble', label: '对话' },
  { key: 'agents', icon: 'smart_toy', label: '搭子' },
  { key: 'files', icon: 'folder', label: '文件' },
  { key: 'brain', icon: 'psychology', label: '长脑子' },
  { key: 'settings', icon: 'settings', label: '设置' },
]
</script>

<template>
  <div class="ab">
    <!-- Logo -->
    <div class="ab-logo" title="韭菜盒子">
      <svg fill="none" height="17" viewBox="0 0 100 60" width="28" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 50C10 50 10 10 50 10C90 10 90 50 90 50" fill="none" stroke="#B9AB6E" stroke-linecap="round" stroke-width="2"/>
        <path d="M10 50C12 47 15 47 17 50C19 53 22 53 24 50C26 47 29 47 31 50C33 53 36 53 38 50C40 47 43 47 45 50C47 53 50 53 52 50C54 47 57 47 59 50C61 53 64 53 66 50C68 47 71 47 73 50C75 53 78 53 80 50C82 47 85 47 87 50C89 53 90 53 90 50" stroke="#B9AB6E" stroke-linecap="round" stroke-width="2"/>
      </svg>
    </div>

    <!-- Navigation tabs -->
    <div class="ab-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="ab-icon"
        :class="{ active: active === t.key }"
        :title="t.label"
        @click="emit('switch', t.key)"
      >
        <span class="mso">{{ t.icon }}</span>
      </button>
    </div>

    <div class="ab-spacer" />

    <!-- Bottom: user / wallet -->
    <a class="ab-icon" href="https://api.jiucaihezi.studio/topup" target="_blank" title="充值">
      <span class="mso">account_balance_wallet</span>
    </a>
  </div>
</template>

<style scoped>
.ab {
  width: 52px;
  background: var(--surface-alt);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 2px;
  flex-shrink: 0;
  z-index: 10;
}
.ab-logo {
  width: 40px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  cursor: pointer;
}
.ab-tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ab-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--ink3);
  cursor: pointer;
  transition: all 0.15s;
  font-size: 22px;
  border: none;
  background: none;
  text-decoration: none;
}
.ab-icon:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.ab-icon.active {
  background: rgba(213, 199, 135, 0.15);
  color: var(--olive-dark);
}
.ab-spacer { flex: 1; }
</style>
