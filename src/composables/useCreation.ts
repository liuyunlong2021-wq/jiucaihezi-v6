/**
 * useCreation.ts — 创作面板状态管理
 * 搬迁自 code.html L19003-19200
 */
import { reactive, computed } from 'vue'
import {
  type CreationTask,
  type CreationModel,
  RH_CREATION_MODELS,
  getModelsForTask,
  getAspectOptions,
  getDefaultAspect,
  getResolutionOptions,
  getDefaultResolution,
} from '@/data/creationModels'

// ─── 结果项 ───
export interface CreationResult {
  url: string
  type: 'image' | 'video' | 'audio' | 'unknown'
  model: string
  task: string
  ts: number
}

// ─── 状态 ───
export interface CpState {
  task: CreationTask
  modelKey: string
  prompt: string
  prompt2: string
  ar: string
  res: string
  dur: number
  vcStart: string
  vcEnd: string
  files: File[]
  generating: boolean
  runningTasks: number
  progress: number
  progressText: string
  results: CreationResult[]
}

const STORAGE_KEY = 'jc_cp_state_v2'

function loadSaved(): Partial<CpState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const saved = loadSaved()

export const cpState = reactive<CpState>({
  task: (saved.task as CreationTask) || 'text-image',
  modelKey: saved.modelKey || 'pro',
  prompt: saved.prompt || '',
  prompt2: saved.prompt2 || '',
  ar: saved.ar || '1:1',
  res: saved.res || '2k',
  dur: saved.dur || 5,
  vcStart: saved.vcStart || '0:00',
  vcEnd: saved.vcEnd || '0:11',
  files: [],
  generating: false,
  runningTasks: 0,
  progress: 0,
  progressText: '',
  results: saved.results || [],
})

// ─── 持久化 ───
export function saveCpState() {
  try {
    const { task, modelKey, prompt, prompt2, ar, res, dur, vcStart, vcEnd, results } = cpState
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ task, modelKey, prompt, prompt2, ar, res, dur, vcStart, vcEnd, results }))
  } catch { /* noop */ }
}

// ─── 计算属性 ───
export const currentModel = computed<CreationModel | undefined>(
  () => RH_CREATION_MODELS[cpState.modelKey]
)

export const availableModels = computed(() => getModelsForTask(cpState.task))

export const aspectOptions = computed(() =>
  currentModel.value ? getAspectOptions(currentModel.value, cpState.task) : []
)

export const resolutionOptions = computed(() =>
  currentModel.value ? getResolutionOptions(currentModel.value, cpState.task) : []
)

export const durationRange = computed(() => {
  const m = currentModel.value
  if (!m || !m.dur || m.dur.length < 2) return null
  return { min: m.dur[0], max: m.dur[m.dur.length - 1], step: m.durStep || 1 }
})

export const hasDuration = computed(() => !!durationRange.value)

// ─── 操作 ───
export function switchTask(task: CreationTask) {
  cpState.task = task
  // 确保模型在新任务下可用
  const models = getModelsForTask(task)
  if (!models.includes(cpState.modelKey)) {
    cpState.modelKey = models[0] || 'pro'
  }
  syncParams()
  saveCpState()
}

export function switchModel(key: string) {
  cpState.modelKey = key
  syncParams()
  saveCpState()
}

function syncParams() {
  const m = currentModel.value
  if (!m) return
  // 同步 aspect
  const ars = getAspectOptions(m, cpState.task)
  if (ars.length && !ars.includes(cpState.ar)) {
    cpState.ar = getDefaultAspect(m, cpState.task)
  }
  // 同步 resolution
  const ress = getResolutionOptions(m, cpState.task)
  if (ress.length && !ress.includes(cpState.res)) {
    cpState.res = getDefaultResolution(m, cpState.task)
  }
  // 同步 duration
  if (m.dur && m.dur.length >= 2) {
    if (cpState.dur < m.dur[0]) cpState.dur = m.defDur || m.dur[0]
    if (cpState.dur > m.dur[m.dur.length - 1]) cpState.dur = m.defDur || m.dur[0]
  }
}

export function setAspect(ar: string) {
  cpState.ar = ar
  saveCpState()
}

export function setResolution(res: string) {
  cpState.res = res
  saveCpState()
}

export function setDuration(dur: number) {
  cpState.dur = dur
  saveCpState()
}

// ─── 文件处理 ───
export function addFiles(fileList: FileList | File[]) {
  Array.from(fileList).forEach(f => cpState.files.push(f))
}

export function removeFile(index: number) {
  cpState.files.splice(index, 1)
}

export function clearFiles() {
  cpState.files.splice(0)
}

// ─── 结果管理 ───
export function addResult(r: CreationResult) {
  cpState.results.unshift(r)
  saveCpState()
}

export function clearResults() {
  cpState.results.splice(0)
  saveCpState()
}

// ─── 提示词 placeholder ───
export const promptPlaceholder = computed(() => {
  const m = currentModel.value
  const t = cpState.task
  if (t === 'character-upload') return '上传角色视频后直接点生成，无需填写提示词。'
  if (t === 'multimodal-video') return '描述你想生成的视频内容，可结合图片、视频和音频素材。'
  if (t === 'text-music') return '描述你想创作的音乐风格和主题，如：欢快的流行歌曲，关于夏天的回忆'
  if (t === 'digital-human') return '描述画面内容，如：女人一边说话一边往前走 (节点20)'
  if (t === 'text-audio') return '输入生成的文稿内容 (节点14)'
  if (t === 'voice-clone') return '输入需要克隆输出的文字内容 (节点11)'
  if (m?.promptOptional) return '提示词（可选）'
  return '描述你想生成的内容...'
})

export const prompt2Placeholder = computed(() => {
  const t = cpState.task
  if (t === 'digital-human') return '输入对白内容 (节点41)'
  if (t === 'text-audio') return '输入声音特点描述 (节点15)'
  if (t === 'voice-clone') return '输入参考音频的文字内容 (节点36)'
  return ''
})

export const showSecondaryInput = computed(() =>
  ['digital-human', 'text-audio', 'voice-clone'].includes(cpState.task)
)

export const showVoiceCloneTimes = computed(() => cpState.task === 'voice-clone')
