/**
 * composables/useTheme.ts — 主题切换
 * 源自 code.html:
 *   - getThemePreference() (行 13245-13251)
 *   - applyThemePreference() (行 13305-13318)
 *   - toggleThemePreference() (行 13320-13324)
 *   - cycle: light → dark → green → light (行 13321)
 */
import { ref, watch } from 'vue'

type Theme = 'light' | 'dark' | 'green'

function normalizeTheme(value: string | null): Theme {
  const v = String(value || '').toLowerCase()
  if (v === 'dark' || v === 'green') return v
  return 'light'
}

const theme = ref<Theme>(normalizeTheme(localStorage.getItem('jcTheme')))

/**
 * applyThemePreference — 精确复制自 code.html 行 13305-13318
 */
function apply(t: Theme) {
  const root = document.documentElement
  if (t === 'light') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  try {
    localStorage.setItem('jcTheme', t)
  } catch {}
}

// 初始化
apply(theme.value)

// 同步响应
watch(theme, apply)

// 监听跨标签页 (行 13328-13329)
window.addEventListener('storage', (event) => {
  if (event?.key === 'jcTheme') {
    theme.value = normalizeTheme(event.newValue)
  }
})

export function useTheme() {
  /**
   * toggleThemePreference — 精确复制自行 13320-13324
   * cycle: light → dark → green → light
   */
  function toggle() {
    const cycle: Record<string, Theme> = { light: 'dark', dark: 'green', green: 'light' }
    theme.value = cycle[theme.value] || 'dark'
  }

  /** 直接设置 */
  function setTheme(t: Theme) {
    theme.value = t
  }

  /** 当前主题图标 (行 13256) */
  const themeIcon = ref('')
  watch(theme, (t) => {
    const iconMap: Record<string, string> = { light: 'dark_mode', dark: 'eco', green: 'light_mode' }
    themeIcon.value = iconMap[t] || 'dark_mode'
  }, { immediate: true })

  /** 当前主题标签 (行 13255) */
  const themeLabel = ref('')
  watch(theme, (t) => {
    const labelMap: Record<string, string> = { light: '切换黑夜模式', dark: '切换护眼模式', green: '切换浅色模式' }
    themeLabel.value = labelMap[t] || '切换黑夜模式'
  }, { immediate: true })

  return { theme, toggle, setTheme, themeIcon, themeLabel }
}
