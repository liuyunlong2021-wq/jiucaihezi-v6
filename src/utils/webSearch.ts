/**
 * utils/webSearch.ts — 联网搜索工具（Jina Search API）
 *
 * 流程:
 *   1. 通过 Nginx 代理调用 s.jina.ai（隐藏 API Key）
 *   2. 返回纯净 Markdown 搜索结果
 *   3. 前端将结果注入 system prompt → LLM 基于实时数据回答
 *
 * 费用: Jina 免费 100万 Token/月，足够日均 150 用户使用
 */

import { resolveApiConfig } from './api'

/** 搜索结果条目 */
export interface SearchResult {
  title: string
  url: string
  content: string
}

/** 搜索返回 */
export interface WebSearchResponse {
  query: string
  results: SearchResult[]
  markdown: string       // 拼接好的 markdown 文本（直接塞进 system prompt）
  tokenEstimate: number  // 粗略 token 估算
  searchTime: number     // 搜索耗时（ms）
}

/**
 * 执行联网搜索
 * @param query  用户的搜索词
 * @param maxResults  最多返回几条（默认 5，省 token）
 */
export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResponse> {
  if (!query.trim()) {
    return { query, results: [], markdown: '', tokenEstimate: 0, searchTime: 0 }
  }

  const start = Date.now()

  try {
    // 直接调用 Jina Search API（前端直连方案）
    // 用户已提供 API Key，无需经过 Nginx 代理，解决 Cloudflare Pages 静态部署下的 404/JSON解析失败问题
    const apiUrl = `https://s.jina.ai/${encodeURIComponent(query)}`

    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'Authorization': 'Bearer jina_7182c05eeca34cd8a64278bdeb8b48e2AhGhp03kGODG3WTPkAxFG6DwWzqO'
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.warn(`[WebSearch] 代理返回 ${res.status}`)
      return { query, results: [], markdown: '', tokenEstimate: 0, searchTime: Date.now() - start }
    }

    let data: any
    try {
      data = await res.json()
    } catch {
      console.warn('[WebSearch] JSON 解析失败')
      return { query, results: [], markdown: '', tokenEstimate: 0, searchTime: Date.now() - start }
    }

    const searchTime = Date.now() - start

    // Jina 返回 { code: 200, data: [...] } 或 { code: 401, message: "..." }
    if (!data?.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.warn('[WebSearch] 无搜索结果', data?.message || '')
      return { query, results: [], markdown: '', tokenEstimate: 0, searchTime }
    }

    // Jina Search 返回格式: { data: [{ title, url, content, description }] }
    const items: SearchResult[] = (data.data || [])
      .slice(0, maxResults)
      .map((item: any) => ({
        title: item.title || '',
        url: item.url || '',
        content: (item.content || item.description || '').slice(0, 1500),  // 每条最多 1500 字符，控制 token
      }))

    // 拼接成 LLM 友好的 Markdown
    const markdown = buildSearchMarkdown(query, items)
    const tokenEstimate = Math.ceil(markdown.length / 2)  // 粗估：中文约 2 字符/token

    return { query, results: items, markdown, tokenEstimate, searchTime }
  } catch (err) {
    console.warn('[WebSearch] 搜索失败:', (err as Error).message)
    return { query, results: [], markdown: '', tokenEstimate: 0, searchTime: Date.now() - start }
  }
}

/**
 * 将搜索结果拼接成大模型友好的 Markdown 文本
 */
function buildSearchMarkdown(query: string, results: SearchResult[]): string {
  if (results.length === 0) return ''

  const lines: string[] = [
    `[联网搜索结果] 搜索词: "${query}"`,
    `搜索时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    `共 ${results.length} 条结果:`,
    '',
  ]

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    lines.push(`### ${i + 1}. ${r.title}`)
    lines.push(`来源: ${r.url}`)
    lines.push(r.content)
    lines.push('')
  }

  lines.push('---')
  lines.push('请基于以上搜索结果回答用户问题。如果搜索结果中没有相关信息，请如实告知。引用信息时请注明来源。')

  return lines.join('\n')
}

/**
 * 将 Jina Reader 抓取的纯文本搜索结果格式化
 */
function buildReaderSearchMarkdown(query: string, rawText: string): string {
  if (!rawText.trim()) return ''

  const lines: string[] = [
    `[联网搜索结果] 搜索词: "${query}"`,
    `搜索时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    '',
    rawText,
    '',
    '---',
    '请基于以上搜索结果回答用户问题。如果搜索结果中没有相关信息，请如实告知。引用信息时请注明来源。',
  ]

  return lines.join('\n')
}
