import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Styles — design tokens first, then base
import './styles/design-tokens.css'
import './styles/base.css'

// Boot theme from localStorage (flicker-free)
try {
  const theme = String(localStorage.getItem('jcTheme') || '').toLowerCase()
  if (theme === 'dark' || theme === 'green') {
    document.documentElement.setAttribute('data-theme', theme)
  }
} catch (_) {}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
