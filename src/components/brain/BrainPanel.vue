<script setup lang="ts">
/**
 * BrainPanel.vue — 长脑子面板（karpathy-llm-wiki + darwin-skill 完全体）
 * UI 搬运自 dazi-studio/web/工作台/code.html L1761-1830
 *
 * 功能：
 * 1. 展示每个搭子的知识索引状态
 * 2. 5 步进度条扫描
 * 3. 建议列表（待处理/已采用/已忽略）
 * 4. 进化反哺（darwin-skill: evaluate → improve → test → keep/revert）
 */
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useBrain } from '@/composables/useBrain'
import { useEvolution } from '@/composables/useEvolution'
import type { BrainSuggestion } from '@/composables/useBrain'

const emit = defineEmits<{ (e: 'close'): void }>()
const store = useAgentStore()

const {
  isProcessing,
  currentStep,
  stepLabels,
  suggestions,
  lintResults,
  wikiLog,
  wikiIndex,
  getSkillBrainStats,
  runBrainCompilation,
  runBrainLint,
  archiveQueryResult,
  setSuggestionStatus,
  acceptAllSuggestions,
  ignoreAllSuggestions,
  getAcceptedSuggestionsBySkill,
} = useBrain()

const { evolveSkill, keepEvolution, isEvolving, evolveStep, evolveStepLabels } = useEvolution()

// ─── 视图切换 ───
type ViewMode = 'index' | 'processing' | 'result' | 'evolving' | 'evolve-preview' | 'lint-result' | 'log'
const viewMode = ref<ViewMode>('index')
const resultTab = ref<'pending' | 'accepted' | 'ignored'>('pending')

// ─── 进化预览状态 ───
const evolveResults = ref<{ skillId: string; skillName: string; summary: string; newContent: string; oldContent: string }[]>([])

// ─── 搭子知识状态 ───
const brainStats = computed(() => getSkillBrainStats(store.agents))

// ─── 开始整理 ───
async function startBrainRun() {
  viewMode.value = 'processing'
  await runBrainCompilation(store.agents)
  viewMode.value = 'result'
}

// ─── 体检（Lint） ───
function startLint() {
  runBrainLint()
  viewMode.value = 'lint-result'
}

// ─── 采用单条建议 → 实际写入搭子 ───
function acceptSuggestion(s: BrainSuggestion) {
  setSuggestionStatus(s.id, 'accepted')
  // 把建议内容追加到搭子的 skillContent
  const skill = store.agents.find(a => a.id === s.skillId)
  if (skill) {
    const appendix = `\n\n---\n[知识反哺 ${new Date().toLocaleDateString('zh-CN')}]\n${s.type === 'rule' ? s.content : s.type === 'trigger' ? `新触发词: ${s.content}` : s.content}`
    store.updateSkill(s.skillId, {
      skillContent: skill.skillContent + appendix,
    })
  }
}

// ─── 反哺（darwin-skill 完整流程）───
async function startFanbu() {
  // 收集已采用建议按搭子分组，用于生成 wiki 上下文
  const grouped = getAcceptedSuggestionsBySkill()
  const skills = store.agents.filter(a => {
    // 有知识的搭子才能反哺
    const stat = brainStats.value.find(s => s.skillId === a.id)
    return stat && (stat.wikiCount > 0 || grouped[a.id])
  })

  if (skills.length === 0) {
    alert('没有可反哺的搭子。请先点"整理"收集经验。')
    return
  }

  viewMode.value = 'evolving'
  evolveResults.value = []

  for (const skill of skills) {
    // 构建 wiki 内容
    const sug = grouped[skill.id] || []
    const wikiText = sug.length > 0
      ? sug.map(s => `[${s.type}] ${s.content}`).join('\n')
      : `搭子"${skill.name}"的使用经验（自动收集）`

    const result = await evolveSkill(skill, wikiText)
    if (result.success) {
      evolveResults.value.push({
        skillId: skill.id,
        skillName: skill.name,
        summary: result.summary,
        newContent: result.newContent,
        oldContent: skill.skillContent,
      })
    }
  }

  viewMode.value = evolveResults.value.length > 0 ? 'evolve-preview' : 'result'
}

// ─── 确认采用进化结果（darwin-skill: keep）───
function confirmEvolve(idx: number) {
  const r = evolveResults.value[idx]
  const skill = store.agents.find(a => a.id === r.skillId)
  if (skill) {
    const evolved = keepEvolution(skill, r.newContent, r.summary)
    store.updateSkill(r.skillId, {
      skillContent: evolved.skillContent,
      version: evolved.version,
      evolutionLog: evolved.evolutionLog,
    })
  }
  evolveResults.value.splice(idx, 1)
  if (evolveResults.value.length === 0) viewMode.value = 'index'
}

// ─── 拒绝进化（darwin-skill: revert）───
function rejectEvolve(idx: number) {
  evolveResults.value.splice(idx, 1)
  if (evolveResults.value.length === 0) viewMode.value = 'index'
}

// ─── 建议过滤 ───
const filteredSuggestions = computed(() =>
  suggestions.value.filter(s => s.status === resultTab.value)
)

const pendingCount = computed(() => suggestions.value.filter(s => s.status === 'pending').length)
const acceptedCount = computed(() => suggestions.value.filter(s => s.status === 'accepted').length)
const ignoredCount = computed(() => suggestions.value.filter(s => s.status === 'ignored').length)

function typeLabel(type: string) {
  const map: Record<string, string> = {
    rule: '📋 规则',
    reference: '📎 参考资料',
    example: '💬 示例',
    trigger: '🏷️ 触发词',
  }
  return map[type] || type
}

function formatDate(ts: number) {
  if (!ts) return '从未整理'
  return new Date(ts).toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="brain-panel">
    <div class="brain-head">
      <div class="brain-title-row">
        <span class="mso brain-icon">psychology</span>
        <div>
          <div class="brain-title">长脑子</div>
          <div class="brain-subtitle">把你的历史对话整理成经验，让搭子自动变聪明。</div>
        </div>
      </div>
      <button class="brain-close" @click="emit('close')">&times;</button>
    </div>

    <!-- ─── 索引视图（默认） ─── -->
    <div v-if="viewMode === 'index'" class="brain-body">
      <!-- 搭子知识状态列表 -->
      <div class="brain-stats-list">
        <div v-for="stat in brainStats" :key="stat.skillId" class="brain-stat-row">
          <div class="stat-name">{{ stat.skillName }}</div>
          <div class="stat-detail">
            <span>对话 <strong>{{ stat.rawCount }}</strong> 条</span>
            <span>经验 <strong>{{ stat.wikiCount }}</strong> 篇</span>
            <span class="stat-date">{{ formatDate(stat.lastCompiled) }}</span>
          </div>
          <div v-if="stat.unindexedCount > 0" class="stat-badge">
            {{ stat.unindexedCount }} 条待整理
          </div>
        </div>
        <div v-if="brainStats.length === 0" class="brain-empty">
          还没有搭子，先创建一个吧。
        </div>
      </div>

      <!-- 功能说明（搬运自 dazi L1783-1785） -->
      <div class="brain-start-card">
        <div class="brain-start-points">
          <div class="brain-start-point">
            <span class="mso">psychology_alt</span>
            <strong>发现重复问题</strong>
            <span>找出反复遇到的工作难点。</span>
          </div>
          <div class="brain-start-point">
            <span class="mso">tune</span>
            <strong>给出清楚建议</strong>
            <span>说明建议怎么做，影响哪个搭子。</span>
          </div>
          <div class="brain-start-point">
            <span class="mso">verified</span>
            <strong>点一下采用</strong>
            <span>系统会默默完成增强或创建。</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="brain-action-row">
        <button class="brain-primary-btn" @click="startBrainRun">
          <span class="mso">play_arrow</span>整理
        </button>
        <button class="brain-primary-btn brain-fb-btn" @click="startFanbu" title="将知识库内容对照搭子进行升级（darwin-skill）">
          <span class="mso">auto_fix_high</span>反哺
        </button>
        <button class="brain-secondary-btn brain-lint-btn" @click="startLint" title="知识库体检（karpathy-wiki lint）">
          <span class="mso">health_and_safety</span>体检
        </button>
        <button class="brain-secondary-btn" @click="viewMode = 'log'" title="操作日志（wiki/log.md）">
          <span class="mso">receipt_long</span>日志
        </button>
        <button class="brain-secondary-btn" @click="viewMode = 'result'" v-if="suggestions.length > 0">
          <span class="mso">history</span>上次结果
        </button>
      </div>
    </div>

    <!-- ─── 处理中视图（搬运自 dazi L1793-1807） ─── -->
    <div v-if="viewMode === 'processing'" class="brain-body">
      <div class="brain-processing-card">
        <div class="brain-result-title">正在帮你整理经验</div>
        <div class="brain-result-copy">系统正在阅读资料，稍等一下就能看到建议。</div>

        <div class="brain-processing-steps">
          <div
            v-for="i in 5"
            :key="i"
            class="brain-step"
            :class="{ active: currentStep === i, done: currentStep > i }"
          >
            <span class="brain-step-dot">{{ currentStep > i ? '✓' : i }}</span>
            <div class="brain-step-label">{{ stepLabels[i] }}</div>
            <div class="brain-step-note">
              {{ currentStep > i ? '完成' : currentStep === i ? '进行中...' : '等待中' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 结果视图（搬运自 dazi L1809-1828） ─── -->
    <div v-if="viewMode === 'result'" class="brain-body">
      <div class="brain-result-top">
        <div>
          <div class="brain-result-title">整理完成</div>
          <div class="brain-result-copy">本次发现 {{ suggestions.length }} 条经验建议。</div>
        </div>
        <div class="brain-action-row" v-if="pendingCount > 0">
          <button class="brain-soft-btn" @click="acceptAllSuggestions">全部采用</button>
          <button class="brain-secondary-btn" @click="ignoreAllSuggestions">全部忽略</button>
        </div>
      </div>

      <!-- Tabs（搬运自 dazi L1822-1826） -->
      <div class="brain-tabs">
        <button
          class="brain-tab"
          :class="{ active: resultTab === 'pending' }"
          @click="resultTab = 'pending'"
        >待处理 {{ pendingCount }}</button>
        <button
          class="brain-tab"
          :class="{ active: resultTab === 'accepted' }"
          @click="resultTab = 'accepted'"
        >已采用 {{ acceptedCount }}</button>
        <button
          class="brain-tab"
          :class="{ active: resultTab === 'ignored' }"
          @click="resultTab = 'ignored'"
        >已忽略 {{ ignoredCount }}</button>
      </div>

      <!-- 建议列表 -->
      <div class="brain-suggestion-list">
        <div v-for="s in filteredSuggestions" :key="s.id" class="brain-suggestion-card">
          <div class="sug-head">
            <span class="sug-skill">{{ s.skillName }}</span>
            <span class="sug-type">{{ typeLabel(s.type) }}</span>
          </div>
          <div class="sug-content">{{ s.content }}</div>
          <div class="sug-actions" v-if="s.status === 'pending'">
            <button class="sug-btn accept" @click="acceptSuggestion(s)">采用</button>
            <button class="sug-btn ignore" @click="setSuggestionStatus(s.id, 'ignored')">忽略</button>
          </div>
        </div>
        <div v-if="filteredSuggestions.length === 0" class="brain-empty">
          暂无{{ resultTab === 'pending' ? '待处理' : resultTab === 'accepted' ? '已采用' : '已忽略' }}的建议。
        </div>
      </div>

      <button class="brain-back-btn" @click="viewMode = 'index'">← 返回索引</button>
    </div>

    <!-- ─── 进化中视图 ─── -->
    <div v-if="viewMode === 'evolving'" class="brain-body">
      <div class="brain-processing-card">
        <div class="brain-result-title">🧬 正在进化搭子</div>
        <div class="brain-result-copy">正在使用 darwin-skill 引擎升级搭子能力...</div>
        <div class="brain-processing-steps">
          <div
            v-for="i in 4"
            :key="i"
            class="brain-step"
            :class="{ active: evolveStep === i, done: evolveStep > i }"
          >
            <span class="brain-step-dot">{{ evolveStep > i ? '✓' : i }}</span>
            <div class="brain-step-label">{{ evolveStepLabels[i] }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 进化预览视图（darwin-skill: test → keep/revert）─── -->
    <div v-if="viewMode === 'evolve-preview'" class="brain-body">
      <div class="brain-result-title">🧬 进化方案预览</div>
      <div class="brain-result-copy">以下搭子有升级方案，请逐个确认。</div>

      <div v-for="(r, idx) in evolveResults" :key="r.skillId" class="evolve-card">
        <div class="evolve-card-head">
          <strong>{{ r.skillName }}</strong>
          <span class="evolve-badge">v{{ (store.agents.find(a => a.id === r.skillId)?.version || 1) }} → v{{ (store.agents.find(a => a.id === r.skillId)?.version || 1) + 1 }}</span>
        </div>
        <div class="evolve-summary">{{ r.summary }}</div>
        <div class="evolve-diff">
          <div class="evolve-diff-col">
            <div class="evolve-diff-label">原版（前 200 字）</div>
            <pre class="evolve-pre">{{ r.oldContent.slice(0, 200) }}...</pre>
          </div>
          <div class="evolve-diff-col evolve-diff-new">
            <div class="evolve-diff-label">新版（前 200 字）</div>
            <pre class="evolve-pre">{{ r.newContent.slice(0, 200) }}...</pre>
          </div>
        </div>
        <div class="evolve-actions">
          <button class="sug-btn accept" @click="confirmEvolve(idx)">✅ 采用</button>
          <button class="sug-btn ignore" @click="rejectEvolve(idx)">↩ 回滚</button>
        </div>
      </div>

      <button class="brain-back-btn" @click="viewMode = 'index'">← 返回索引</button>
    </div>

    <!-- ─── 体检结果视图（karpathy-wiki Lint） ─── -->
    <div v-if="viewMode === 'lint-result'" class="brain-body">
      <div class="brain-result-title">🩺 知识库体检报告</div>
      <div class="brain-result-copy">
        {{ lintResults.filter(i => i.severity === 'auto-fixed').length }} 个自动修复，
        {{ lintResults.filter(i => i.severity === 'report').length }} 个需关注
      </div>
      <div class="brain-suggestion-list">
        <div v-for="issue in lintResults" :key="issue.id" class="brain-suggestion-card">
          <div class="sug-head">
            <span class="sug-type" :class="{ 'lint-fixed': issue.severity === 'auto-fixed', 'lint-report': issue.severity === 'report' }">
              {{ issue.severity === 'auto-fixed' ? '✅ 已修复' : '⚠️ 需关注' }}
            </span>
            <span class="sug-skill">{{ issue.category }}</span>
          </div>
          <div class="sug-content">{{ issue.description }}</div>
        </div>
        <div v-if="lintResults.length === 0" class="brain-empty">知识库状态良好，没有发现问题。</div>
      </div>
      <button class="brain-back-btn" @click="viewMode = 'index'">← 返回索引</button>
    </div>

    <!-- ─── 操作日志视图（wiki/log.md） ─── -->
    <div v-if="viewMode === 'log'" class="brain-body">
      <div class="brain-result-title">📋 操作日志</div>
      <div class="brain-result-copy">wiki/log.md — append-only 操作记录</div>
      <div class="brain-suggestion-list">
        <div v-for="entry in [...wikiLog].reverse().slice(0, 50)" :key="entry.id" class="brain-suggestion-card">
          <div class="sug-head">
            <span class="sug-type log-op">{{ entry.operation }}</span>
            <span class="sug-skill">{{ new Date(entry.timestamp).toLocaleString('zh-CN') }}</span>
          </div>
          <div class="sug-content">{{ entry.description }}</div>
        </div>
        <div v-if="wikiLog.length === 0" class="brain-empty">暂无操作记录。</div>
      </div>
      <button class="brain-back-btn" @click="viewMode = 'index'">← 返回索引</button>
    </div>
  </div>
</template>

<style scoped>
.brain-panel { height: 100%; display: flex; flex-direction: column; }
.brain-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--line);
}
.brain-title-row { display: flex; align-items: center; gap: 10px; }
.brain-icon { font-size: 28px; color: var(--olive); }
.brain-title { font-size: 16px; font-weight: 700; color: var(--ink1); }
.brain-subtitle { font-size: 12px; color: var(--ink3); margin-top: 2px; }
.brain-close {
  background: none; border: none; font-size: 22px;
  color: var(--ink3); cursor: pointer;
}
.brain-body {
  flex: 1; overflow-y: auto; padding: 16px 20px;
}

/* 索引状态列表 */
.brain-stats-list { margin-bottom: 16px; }
.brain-stat-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--line); margin-bottom: 8px;
}
.stat-name { font-weight: 700; font-size: 13px; color: var(--ink1); min-width: 80px; }
.stat-detail {
  display: flex; gap: 12px; font-size: 12px; color: var(--ink3); flex: 1;
}
.stat-detail strong { color: var(--ink1); }
.stat-date { margin-left: auto; }
.stat-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: var(--olive); color: #fff; font-weight: 600;
}

/* 功能说明（搬运自 dazi-studio） */
.brain-start-card { margin: 16px 0; }
.brain-start-points { display: flex; flex-direction: column; gap: 10px; }
.brain-start-point {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--ink2);
}
.brain-start-point .mso { font-size: 20px; color: var(--olive); }
.brain-start-point strong { color: var(--ink1); min-width: 80px; }

/* 操作按钮 */
.brain-action-row { display: flex; gap: 10px; margin-top: 16px; }
.brain-primary-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 22px; border: none; border-radius: 10px;
  background: var(--olive); color: #fff;
  font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.brain-secondary-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 18px; border-radius: 10px;
  border: 1.5px solid var(--line); background: var(--paper);
  font-size: 13px; color: var(--ink2); cursor: pointer; font-family: inherit;
}
.brain-soft-btn {
  padding: 8px 16px; border: none; border-radius: 8px;
  background: var(--olive); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
}

/* 进度条 */
.brain-processing-card { padding: 16px 0; }
.brain-result-title { font-size: 16px; font-weight: 700; color: var(--ink1); }
.brain-result-copy { font-size: 13px; color: var(--ink3); margin: 4px 0 16px; }
.brain-processing-steps { display: flex; flex-direction: column; gap: 12px; }
.brain-step {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--line); opacity: .5;
  transition: all .2s;
}
.brain-step.active { opacity: 1; border-color: var(--olive); background: var(--bg); }
.brain-step.done { opacity: .8; }
.brain-step-dot {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  background: var(--line); color: var(--ink3);
}
.brain-step.active .brain-step-dot { background: var(--olive); color: #fff; }
.brain-step.done .brain-step-dot { background: #4a7; color: #fff; }
.brain-step-label { font-size: 14px; font-weight: 600; color: var(--ink1); }
.brain-step-note { margin-left: auto; font-size: 12px; color: var(--ink3); }

/* 结果 */
.brain-result-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 16px;
}
.brain-tabs { display: flex; gap: 0; margin-bottom: 12px; }
.brain-tab {
  flex: 1; padding: 8px; border: none; background: none;
  font-size: 13px; font-weight: 600; color: var(--ink3);
  border-bottom: 2px solid transparent; cursor: pointer; font-family: inherit;
}
.brain-tab.active { color: var(--olive); border-bottom-color: var(--olive); }

/* 建议卡片 */
.brain-suggestion-list { display: flex; flex-direction: column; gap: 8px; }
.brain-suggestion-card {
  padding: 12px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg);
}
.sug-head { display: flex; gap: 8px; margin-bottom: 6px; }
.sug-skill { font-size: 12px; font-weight: 700; color: var(--olive); }
.sug-type { font-size: 11px; color: var(--ink3); }
.sug-content { font-size: 13px; color: var(--ink1); line-height: 1.5; }
.sug-actions { display: flex; gap: 8px; margin-top: 8px; }
.sug-btn {
  padding: 4px 14px; border-radius: 6px; border: none;
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.sug-btn.accept { background: var(--olive); color: #fff; }
.sug-btn.ignore { background: var(--line); color: var(--ink2); }

.brain-empty { text-align: center; padding: 24px; color: var(--ink3); font-size: 13px; }
.brain-back-btn {
  display: block; margin: 16px auto 0; padding: 8px 16px;
  border: 1px solid var(--line); border-radius: 8px;
  background: var(--paper); color: var(--ink2);
  font-size: 13px; cursor: pointer; font-family: inherit;
}
.brain-fb-btn { background: #e67e22; }
.brain-fb-btn:hover { background: #d35400; }

/* 进化预览卡片 */
.evolve-card {
  padding: 14px; border-radius: 10px;
  border: 1px solid var(--line); margin-bottom: 12px;
  background: var(--bg);
}
.evolve-card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.evolve-card-head strong { font-size: 14px; color: var(--ink1); }
.evolve-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(46, 125, 50, 0.1); color: #2e7d32; font-weight: 600;
}
.evolve-summary {
  font-size: 12px; color: var(--ink2); line-height: 1.7;
  margin-bottom: 10px; white-space: pre-line;
}
.evolve-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.evolve-diff-col {
  border: 1px solid var(--line); border-radius: 8px; overflow: hidden;
}
.evolve-diff-label {
  padding: 4px 8px; font-size: 11px; font-weight: 600;
  background: var(--surface-alt); color: var(--ink3);
  border-bottom: 1px solid var(--line);
}
.evolve-diff-new .evolve-diff-label { background: rgba(46, 125, 50, 0.06); color: #2e7d32; }
.evolve-pre {
  padding: 8px; font-size: 11px; line-height: 1.5;
  color: var(--ink2); white-space: pre-wrap; word-break: break-all;
  max-height: 120px; overflow-y: auto; margin: 0;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.evolve-actions { display: flex; gap: 8px; }

/* Lint 体检 */
.brain-lint-btn { border-color: #4a7; }
.lint-fixed { color: #2e7d32; font-weight: 600; }
.lint-report { color: #e67e22; font-weight: 600; }
.log-op {
  display: inline-block; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  background: rgba(107,142,35,.1); color: var(--olive);
}
</style>
