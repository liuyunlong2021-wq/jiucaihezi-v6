<script setup lang="ts">
/**
 * SettingsPanel — 设置面板
 * 源自 code.html:
 *   - #modal-account-settings (行 1820-1906)
 *   - openAccountSettingsHub() (行 13333-13348)
 *   - API Key / API Base 输入
 *   - 主题切换 (行 13320-13324)
 */
import { ref, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { theme, toggle, themeIcon, themeLabel } = useTheme()

const apiKey = ref('')
const apiBase = ref('')
const showKey = ref(false)
const saved = ref(false)

onMounted(() => {
  apiKey.value = localStorage.getItem('jcApiKey') || ''
  apiBase.value = localStorage.getItem('jcApiBase') || 'https://api.jiucaihezi.studio'
})

function saveSettings() {
  const key = apiKey.value.trim()
  const base = apiBase.value.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  if (key) localStorage.setItem('jcApiKey', key)
  if (base) localStorage.setItem('jcApiBase', base)
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

function getKeyLink() {
  window.open('https://api.jiucaihezi.studio/keys', '_blank')
}

function logout() {
  localStorage.removeItem('jcApiKey')
  localStorage.removeItem('loggedIn')
  window.location.replace('../index.html')
}
</script>

<template>
  <div class="sp">
    <div class="sp-header">
      <span class="mso" style="font-size: 20px; color: var(--olive);">settings</span>
      <h3>设置</h3>
    </div>

    <div class="sp-body">
      <!-- API Key -->
      <div class="sp-section">
        <div class="sp-section-title">API 配置</div>
        
        <label class="sp-label">API Key</label>
        <div class="sp-key-row">
          <input
            v-model="apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
            class="sp-input"
          />
          <button class="sp-icon-btn" @click="showKey = !showKey" :title="showKey ? '隐藏' : '显示'">
            <span class="mso">{{ showKey ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
        <button class="sp-link" @click="getKeyLink">
          <span class="mso" style="font-size: 14px;">open_in_new</span>
          获取 Key
        </button>

        <label class="sp-label" style="margin-top: 16px;">API 地址</label>
        <input
          v-model="apiBase"
          type="text"
          placeholder="https://api.jiucaihezi.studio"
          class="sp-input"
        />

        <button class="sp-save-btn" @click="saveSettings">
          <span class="mso" style="font-size: 16px;">{{ saved ? 'check' : 'save' }}</span>
          {{ saved ? '已保存' : '保存设置' }}
        </button>
      </div>

      <!-- 主题 — 行 13320-13324 -->
      <div class="sp-section">
        <div class="sp-section-title">外观</div>
        <button class="sp-theme-btn" @click="toggle">
          <span class="mso">{{ themeIcon }}</span>
          {{ themeLabel }}
        </button>
        <div class="sp-theme-chips">
          <button
            v-for="t in ['light', 'dark', 'green']"
            :key="t"
            class="sp-chip"
            :class="{ active: theme === t }"
            @click="theme = t as any"
          >
            {{ t === 'light' ? '☀ 浅色' : t === 'dark' ? '🌙 黑夜' : '🍃 护眼' }}
          </button>
        </div>
      </div>

      <!-- 账户 -->
      <div class="sp-section">
        <div class="sp-section-title">账户</div>
        <button class="sp-logout" @click="logout">
          <span class="mso">logout</span>
          退出登录
        </button>
      </div>

      <!-- 版本 -->
      <div class="sp-version">
        韭菜盒子 V6.0 · Vue 3 模块化架构
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  width: 100%;
}
.sp-header {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border2);
  background: var(--surface-alt);
  flex-shrink: 0;
}
.sp-header h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}
.sp-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px 60px;
}
.sp-section {
  margin-bottom: 28px;
}
.sp-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink3);
  margin-bottom: 12px;
}
.sp-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink2);
  margin-bottom: 6px;
}
.sp-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-alt);
  font-size: 13px;
  font-family: inherit;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.sp-input:focus {
  border-color: var(--olive);
}
.sp-key-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.sp-key-row .sp-input {
  flex: 1;
}
.sp-icon-btn {
  width: 36px; height: 36px;
  border: 1px solid var(--border);
  background: var(--surface-alt);
  border-radius: 10px;
  color: var(--ink3);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sp-icon-btn:hover {
  color: var(--olive-dark);
  border-color: var(--olive);
}
.sp-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--olive-dark);
  cursor: pointer;
  font-family: inherit;
  padding: 4px 0;
}
.sp-link:hover { text-decoration: underline; }
.sp-save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 9px 20px;
  border: none;
  border-radius: 10px;
  background: var(--olive);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.1s;
}
.sp-save-btn:hover { transform: scale(1.03); }
.sp-theme-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-alt);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  transition: all 0.15s;
}
.sp-theme-btn:hover {
  border-color: var(--olive);
  background: var(--olive-pale);
}
.sp-theme-chips {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.sp-chip {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-alt);
  color: var(--ink2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: all 0.15s;
}
.sp-chip:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.sp-chip.active {
  background: rgba(213, 199, 135, 0.18);
  border-color: var(--olive);
  color: var(--olive-dark);
}
.sp-logout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--jc-error);
  border-radius: 10px;
  background: none;
  color: var(--jc-error);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.sp-logout:hover {
  background: rgba(200, 80, 80, 0.08);
}
.sp-version {
  text-align: center;
  font-size: 11px;
  color: var(--ink3);
  padding: 24px 0;
  letter-spacing: 0.03em;
}
</style>
