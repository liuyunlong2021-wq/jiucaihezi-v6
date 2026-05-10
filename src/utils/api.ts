/**
 * utils/api.ts — API 请求工具
 * 源自 code.html resolveApiConfig() (行 9845-9870)
 * 源自 code.html streamChat() headers (行 10285-10289)
 */

export interface ApiConfig {
  apiKey: string
  apiBase: string
  model: string
}

const DEFAULT_API_BASE = 'https://api.jiucaihezi.studio'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * 从 localStorage 解析 API 配置
 * 精确复制自 code.html 行 9845-9870 的 resolveApiConfig()
 */
export function resolveApiConfig(): ApiConfig {
  let apiKey = localStorage.getItem('jcApiKey') || ''
  const apiBase = (
    localStorage.getItem('jcApiBase') || DEFAULT_API_BASE
  ).replace(/\/+$/, '').replace(/\/v1$/, '')
  const model = localStorage.getItem('jcModel') || DEFAULT_MODEL

  // Decode base64-encoded key (原代码行 10231, 9860-9863)
  try {
    const decoded = atob(apiKey)
    if (decoded.startsWith('sk-')) apiKey = decoded
  } catch (_) {}

  return { apiKey, apiBase, model }
}

/**
 * 构建请求头
 * 精确复制自 code.html 行 10285-10289
 */
export function buildHeaders(config: ApiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.apiKey,
    'x-api-key': config.apiKey,
  }
  // OpenRouter 兼容 (行 10286-10289)
  if (config.apiBase.includes('openrouter')) {
    headers['HTTP-Referer'] = window.location.href
    headers['X-Title'] = '韭菜盒子'
  }
  return headers
}

/**
 * 检查登录状态 — 简化自 code.html 行 1986-1989
 */
export function checkAuth(): boolean {
  const apiKey = localStorage.getItem('jcApiKey')
  const providerMode = localStorage.getItem('jcProviderMode')
  return !!(apiKey || providerMode === 'member')
}

/**
 * 构建 chat 错误信息 — 简化自 code.html 的 buildChatErrorMessage
 */
export function buildChatErrorMessage(status: number, body: any, fallback: string): string {
  if (status === 401 || status === 403) {
    return '⚠️ API Key 无效或已过期，请检查设置'
  }
  if (status === 402) {
    return '⚠️ 余额不足，请充值后继续使用'
  }
  if (status === 429) {
    return '⚠️ 请求过于频繁，请稍后再试'
  }
  if (body?.error?.message) {
    return '⚠️ ' + body.error.message
  }
  return '⚠️ 请求失败 (' + status + '): ' + (fallback || '未知错误')
}
