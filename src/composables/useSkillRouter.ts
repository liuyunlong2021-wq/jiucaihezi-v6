/**
 * composables/useSkillRouter.ts — superpowers 路由引擎
 *
 * 完全体实现 superpowers 的 skill dispatch 模式：
 *   - 扫描所有已安装 skill 的 name + description + triggers
 *   - LLM 语义分析用户意图
 *   - 支持单 skill 路由 + 多 skill 协作链（chain）
 *
 * @see https://github.com/obra/superpowers — skill dispatch 架构
 */
import { ref } from 'vue'
import { resolveApiConfig, buildHeaders } from '@/utils/api'
import type { SkillConfig, RouteResult } from '@/types/skill'

const lastRouteResult = ref<RouteResult | null>(null)
const isRouting = ref(false)
const routeNotification = ref('')

/**
 * 构建路由 system prompt
 * 参考 superpowers: "The agent checks for relevant skills before any task.
 * Mandatory workflows, not suggestions."
 */
function buildRouterPrompt(skills: SkillConfig[]): string {
  const skillList = skills.map((s, i) => {
    return `### Skill ${i + 1}: ${s.name} (id: ${s.id})
描述: ${s.description}
触发词: ${s.triggers.join(', ')}
能力摘要: ${s.skillContent.slice(0, 200)}...`
  }).join('\n\n')

  return `你是韭菜盒子的意图路由器（Skill Dispatcher）。

## 你的职责
参考 superpowers 的 skill dispatch 模式：在用户发出任何请求之前，先扫描所有已安装的搭子（Skill），判断哪个搭子最适合处理这个请求。

## 已安装的搭子清单

${skillList}

## 路由规则
1. **单 skill 路由（single）**：如果请求明确属于某个搭子的职责范围，直接路由到该搭子。
2. **多 skill 协作（chain）**：如果请求需要多个搭子配合完成，按执行顺序列出。例如：先用"写作"搭子写内容，再用"PPT设计师"搭子排版。
3. **无匹配（none）**：如果没有搭子能处理，返回 none。
4. 优先匹配 triggers 关键词，但也要理解语义。例如用户说"帮我做个汇报材料"应匹配"PPT设计师"。
5. 每个匹配必须说明理由。

## 输出格式
严格输出 JSON（不要 markdown 代码块）：
{"matched": [{"skillId": "xxx", "reason": "xxx"}], "strategy": "single|chain|none"}`
}

/**
 * 执行路由分析
 * @param userMessage 用户消息
 * @param allSkills 所有已安装搭子
 * @returns RouteResult
 */
export async function routeMessage(
  userMessage: string,
  allSkills: SkillConfig[]
): Promise<RouteResult> {
  if (allSkills.length === 0) {
    return { matched: [], strategy: 'none' }
  }

  isRouting.value = true

  try {
    const config = resolveApiConfig()
    const routerPrompt = buildRouterPrompt(allSkills)

    const res = await fetch(`${config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6',
        messages: [
          { role: 'system', content: routerPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 300,
        stream: false,
      }),
    })

    if (!res.ok) {
      console.warn('[SkillRouter] API error:', res.status)
      return { matched: [], strategy: 'none' }
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''

    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result: RouteResult = JSON.parse(jsonMatch[0])
      lastRouteResult.value = result

      // 生成通知文案
      if (result.strategy === 'single' && result.matched.length > 0) {
        const skill = allSkills.find(s => s.id === result.matched[0].skillId)
        routeNotification.value = `🔀 已切换 → ${skill?.name || result.matched[0].skillId}`
      } else if (result.strategy === 'chain' && result.matched.length > 1) {
        const names = result.matched.map(m => {
          const s = allSkills.find(sk => sk.id === m.skillId)
          return s?.name || m.skillId
        })
        routeNotification.value = `🔗 协作链 → ${names.join(' → ')}`
      } else {
        routeNotification.value = ''
      }

      return result
    }

    return { matched: [], strategy: 'none' }
  } catch (e) {
    console.warn('[SkillRouter] Route error:', e)
    return { matched: [], strategy: 'none' }
  } finally {
    isRouting.value = false
  }
}

/**
 * 合并多 skill 的 skillContent 用于 chain 模式
 */
export function buildChainPrompt(
  skills: SkillConfig[],
  matchedIds: string[]
): string {
  const parts = matchedIds.map((id, i) => {
    const skill = skills.find(s => s.id === id)
    if (!skill) return ''
    return `--- Skill ${i + 1}: ${skill.name} ---\n${skill.skillContent}`
  }).filter(Boolean)

  return `你现在需要按顺序使用以下搭子的能力来完成用户的请求：

${parts.join('\n\n')}

请按照以上搭子的工作流程，依次完成任务。`
}

export function useSkillRouter() {
  return {
    lastRouteResult,
    isRouting,
    routeNotification,
    routeMessage,
    buildChainPrompt,
  }
}
