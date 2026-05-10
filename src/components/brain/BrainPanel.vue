<script setup lang="ts">
/**
 * BrainPanel.vue — 长脑子面板（karpathy-llm-wiki 完全体）
 * UI 搬运自 dazi-studio/web/工作台/code.html L1761-1830
 *
 * 功能：
 * 1. 展示每个搭子的知识索引状态
 * 2. 5 步进度条扫描
 * 3. 建议列表（待处理/已采用/已忽略）
 */
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useBrain } from '@/composables/useBrain'
import type { BrainSuggestion } from '@/composables/useBrain'

const emit = defineEmits<{ (e: 'close'): void }>()
const store = useAgentStore()

const {
  isProcessing,
  currentStep,
  stepLabels,
  suggestions,
  getSkillBrainStats,
  runBrainCompilation,
  setSuggestionStatus,
  acceptAllSuggestions,
  ignoreAllSuggestions,
} = useBrain()

// ─── 视图切换 ───
type ViewMode = 'index' | 'processing' | 'result'
const viewMode = ref<ViewMode>('index')
const resultTab = ref<'pending' | 'accepted' | 'ignored'>('pending')

// ─── 搭子知识状态 ───
const brainStats = computed(() => getSkillBrainStats(store.agents))

// ─── 开始整理 ───
async function startBrainRun() {
  viewMode.value = 'processing'
  await runBrainCompilation(store.agents)
  viewMode.value = 'result'
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

// ─── 反哺：darwin-skill 对照 wiki 升级搭子 ───
async function startFanbu() {
  const confirmed = confirm('将使用 darwin-skill 对照知识库内容升级所有搭子，确认？')
  if (!confirmed) return
  viewMode.value = 'processing'
  // TODO: 调用 darwin-skill API (https://github.com/alchaincyf/darwin-skill)
  // 1. 读取 wiki/ 目录内容
  // 2. 对照每个搭子的 SKILL.md
  // 3. 使用 LLM 生成升级补丁
  // 4. 应用补丁
  await runBrainCompilation(store.agents)
  viewMode.value = 'result'
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

      <!-- 操作按钮（搬运自 dazi L1788-1789） -->
      <div class="brain-action-row">
        <button class="brain-primary-btn" @click="startBrainRun">
          <span class="mso">play_arrow</span>整理
        </button>
        <button class="brain-primary-btn brain-fb-btn" @click="startFanbu" title="将知识库内容对照搭子进行升级（darwin-skill）">
          <span class="mso">auto_fix_high</span>反哺
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
            <button class="sug-btn accept" @click="setSuggestionStatus(s.id, 'accepted')">采用</button>
            <button class="sug-btn ignore" @click="setSuggestionStatus(s.id, 'ignored')">忽略</button>
          </div>
        </div>
        <div v-if="filteredSuggestions.length === 0" class="brain-empty">
          暂无{{ resultTab === 'pending' ? '待处理' : resultTab === 'accepted' ? '已采用' : '已忽略' }}的建议。
        </div>
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
</style>
