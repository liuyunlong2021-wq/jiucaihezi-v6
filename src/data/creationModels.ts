/**
 * creationModels.ts — 创作面板模型定义
 * 精确搬迁自 code.html L6809-6910（24 个模型，零遗漏）
 */

// ─── 任务类型 ───
export type CreationTask =
  | 'text-image' | 'image-image'
  | 'text-video' | 'image-video' | 'firstlast-video' | 'multimodal-video'
  | 'character-upload'
  | 'text-music' | 'text-audio' | 'voice-clone' | 'digital-human'

export const RH_TASK_LABELS: Record<CreationTask, string> = {
  'text-image': '文生图',
  'image-image': '图生图',
  'text-video': '文生视频',
  'image-video': '图生视频',
  'firstlast-video': '首尾帧视频',
  'multimodal-video': '多模态视频',
  'character-upload': '角色上传',
  'text-music': '音乐创作',
  'text-audio': '语音设计',
  'voice-clone': '声音克隆',
  'digital-human': '数字人',
}

// ─── 模型配置 ───
export interface CreationModel {
  label: string
  tasks: CreationTask[]
  action: string
  ep?: Record<string, string>
  ar?: string[]
  arByTask?: Record<string, string[]>
  defAr?: string
  defArByTask?: Record<string, string>
  res?: string[]
  resByTask?: Record<string, string[]>
  defRes?: string
  defResByTask?: Record<string, string>
  dur?: number[]
  defDur?: number
  durStep?: number
  fixedDuration?: number
  price?: Record<string, number>
  priceUnit?: string
  provider?: string
  modelName?: string
  editApi?: string
  voiceMode?: string
  aiAppId?: string
  promptOptional?: boolean
}

// 精确搬迁 code.html L6810-6909（24 个模型）
export const RH_CREATION_MODELS: Record<string, CreationModel> = {
  // ═══ RunningHub 生图 ═══
  'pro': {
    label: 'Banana PRO', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-n-pro/text-to-image', 'image-image': 'rhart-image-n-pro/edit' },
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'],
    res: ['1k', '2k', '4k'], defRes: '2k',
    price: { '1k': 50, '2k': 50, '4k': 60 },
  },
  'flash': {
    label: 'Banana V2', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-n-g31-flash/text-to-image', 'image-image': 'rhart-image-n-g31-flash/image-to-image' },
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '1:8', '8:1'],
    res: ['1k', '2k', '4k'], defRes: '2k',
    price: { '1k': 25, '2k': 25, '4k': 30 },
  },
  'banana': {
    label: 'Banana', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-v1/text-to-image', 'image-image': 'rhart-image-v1/edit' },
    ar: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'],
    res: ['1k', '2k', '4k'], defRes: '1k',
    price: { '1k': 11, '2k': 11, '4k': 14 },
  },
  'gpt15': {
    label: 'GPT 1.5', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-g-1.5/text-to-image', 'image-image': 'rhart-image-g-1.5/edit' },
    ar: ['auto', '1:1', '3:2', '2:3'], res: [], defRes: '',
    price: { '': 21 },
  },
  'g15': {
    label: 'GPT 2.0', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-g-2/text-to-image', 'image-image': 'rhart-image-g-2/image-to-image' },
    arByTask: { 'text-image': ['3:2', '1:1', '2:3'], 'image-image': ['2:3', '1:1', '3:2'] },
    defArByTask: { 'text-image': '1:1', 'image-image': '1:1' },
    res: [], defRes: '',
    price: { '': 15 },
  },
  'grokimg': {
    label: 'Grok', tasks: ['text-image', 'image-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image-g/text-to-image', 'image-image': 'rhart-image-g/image-to-image' },
    ar: ['1:1', '16:9', '9:16', '3:2', '2:3'], res: [], defRes: '',
    price: { '': 8 },
  },
  'zimg': {
    label: 'z-image-turbo', tasks: ['text-image'], action: 'generate',
    ep: { 'text-image': 'rhart-image/z-image/turbo-lora' },
    ar: ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '3:4'], res: [], defRes: '',
    price: { '': 5 },
  },

  // ═══ RunningHub 生视频 ═══
  'videox': {
    label: 'Grok Video', tasks: ['text-video', 'image-video'], action: 'generate',
    ep: { 'text-video': 'rhart-video-g/text-to-video', 'image-video': 'rhart-video-g/image-to-video' },
    ar: ['2:3', '3:2', '1:1', '16:9', '9:16'], res: ['720p', '480p'], defRes: '480p',
    dur: [6, 30], defDur: 6, durStep: 1,
    priceUnit: 'per-second', price: { '720p': 8, '480p': 8 },
  },
  'sora2': {
    label: 'Sora 2', tasks: ['image-video'], action: 'generate',
    ep: { 'image-video': 'rhart-video-s/image-to-video' },
    ar: ['9:16', '16:9'], res: [], defRes: '', dur: [10, 15], defDur: 10,
    price: { '': 150 },
  },
  'veo31f': {
    label: 'Veo3.1 Fast', tasks: ['text-video', 'image-video', 'firstlast-video'], action: 'generate',
    ep: { 'text-video': 'rhart-video-v3.1-fast/text-to-video', 'image-video': 'rhart-video-v3.1-fast/image-to-video', 'firstlast-video': 'rhart-video-v3.1-fast/start-end-to-video' },
    ar: ['16:9', '9:16', '1:1'], res: ['720p', '1080p', '4k'], defRes: '720p',
    dur: [5, 8], defDur: 5,
    price: { '720p': 30, '1080p': 40, '4k': 70 },
  },
  'veo31p': {
    label: 'Veo3.1 Pro', tasks: ['text-video', 'image-video', 'firstlast-video'], action: 'generate',
    ep: { 'text-video': 'rhart-video-v3.1-pro/text-to-video', 'image-video': 'rhart-video-v3.1-pro/image-to-video', 'firstlast-video': 'rhart-video-v3.1-pro/start-end-to-video' },
    ar: ['16:9', '9:16', '1:1'], res: ['720p', '1080p', '4k'], defRes: '720p',
    dur: [5, 8], defDur: 5,
    price: { '720p': 30, '1080p': 40, '4k': 70 },
  },
  'seedance2': {
    label: 'Seedance 2.0', tasks: ['text-video', 'image-video', 'firstlast-video', 'multimodal-video'], action: 'generate',
    ep: { 'text-video': 'rhart-video/sparkvideo-2.0/text-to-video', 'image-video': 'rhart-video/sparkvideo-2.0/image-to-video', 'firstlast-video': 'rhart-video/sparkvideo-2.0/image-to-video', 'multimodal-video': 'rhart-video/sparkvideo-2.0/multimodal-video' },
    ar: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    res: ['480p', '720p', '1080p', 'native1080p', '2k', '4k'], defRes: '720p',
    dur: [4, 5, 6, 8, 10, 12, 15], defDur: 5,
    priceUnit: 'per-second', price: { '480p': 150, '720p': 150, '1080p': 150, 'native1080p': 150, '2k': 150, '4k': 150 },
  },
  'seedance2f': {
    label: 'Seedance 2.0 Fast', tasks: ['text-video', 'image-video', 'firstlast-video', 'multimodal-video'], action: 'generate',
    ep: { 'text-video': 'rhart-video/sparkvideo-2.0-fast/text-to-video', 'image-video': 'rhart-video/sparkvideo-2.0-fast/image-to-video', 'firstlast-video': 'rhart-video/sparkvideo-2.0-fast/image-to-video', 'multimodal-video': 'rhart-video/sparkvideo-2.0-fast/multimodal-video' },
    ar: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    res: ['480p', '720p', '1080p', 'native1080p', '2k', '4k'], defRes: '720p',
    dur: [4, 5, 6, 8, 10, 12, 15], defDur: 5,
    priceUnit: 'per-second', price: { '480p': 150, '720p': 150, '1080p': 150, 'native1080p': 150, '2k': 150, '4k': 150 },
  },

  // ═══ 语音/数字人 ═══
  'rh-tts': {
    label: '声音设计', tasks: ['text-audio'], action: 'generate', provider: 'newapi-voice',
    modelName: 'qwen3-tts-vd-2026-01-26', voiceMode: 'design', promptOptional: false,
    ar: [], res: [], defRes: '', dur: [3, 300], defDur: 15, durStep: 1,
    priceUnit: 'per-second', price: { '': 3 },
  },
  'rh-voice-clone': {
    label: '声音克隆', tasks: ['voice-clone'], action: 'generate', provider: 'newapi-voice',
    modelName: 'qwen3-tts-vc-2026-01-22', voiceMode: 'clone', promptOptional: false,
    ar: [], res: [], defRes: '', dur: [3, 120], defDur: 10, durStep: 1,
    priceUnit: 'per-second', price: { '': 10 },
  },
  'rh-digital-human': {
    label: '数字人', tasks: ['digital-human'], action: 'generate', provider: 'rh-aiapp',
    aiAppId: '2036019863617015809', promptOptional: true,
    ar: ['9:16', '16:9'], res: ['1k', '2k'], defRes: '2k', dur: [3, 120], defDur: 10, durStep: 1,
    priceUnit: 'per-second', price: { '1k': 30, '2k': 30 },
  },

  // ═══ NewAPI (JC 自有渠道) ═══
  'newapi-gpt-image-2': {
    label: 'JC GPT Image 2', tasks: ['text-image', 'image-image'], action: 'generate', provider: 'newapi',
    modelName: 'gpt-image-2',
    ar: ['1:1', '3:4', '4:3', '16:9', '9:16'], res: ['1k', '2k', '4k'], defRes: '1k',
    price: { '1k': 10, '2k': 10, '4k': 10 },
  },
  'newapi-gemini-image-2k': {
    label: 'JC Gemini Image 2K', tasks: ['text-image', 'image-image'], action: 'generate', provider: 'newapi',
    modelName: 'gemini-3.1-flash-image-preview-2k', editApi: 'chat',
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], res: [], defRes: '',
    price: { '': 20 },
  },
  'newapi-gemini-image-4k': {
    label: 'JC Gemini Image 4K', tasks: ['text-image', 'image-image'], action: 'generate', provider: 'newapi',
    modelName: 'gemini-3.1-flash-image-preview-4k', editApi: 'chat',
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], res: [], defRes: '',
    price: { '': 30 },
  },
  'newapi-banana-pro-2k': {
    label: 'JC Nano Banana Pro 2K', tasks: ['text-image', 'image-image'], action: 'generate', provider: 'newapi',
    modelName: 'nano-banana-pro-2k', editApi: 'edits',
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'], res: [], defRes: '',
    price: { '': 40 },
  },
  'newapi-banana-pro-4k': {
    label: 'JC Nano Banana Pro 4K', tasks: ['text-image', 'image-image'], action: 'generate', provider: 'newapi',
    modelName: 'nano-banana-pro-4k', editApi: 'edits',
    ar: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'], res: [], defRes: '',
    price: { '': 50 },
  },
  'newapi-veo-fast': {
    label: 'JC Veo3.1 Fast', tasks: ['text-video', 'image-video'], action: 'generate', provider: 'newapi',
    modelName: 'veo3.1-fast',
    ar: ['16:9', '9:16'], res: [], defRes: '', fixedDuration: 8,
    price: { '': 40 },
  },
  'newapi-veo-components': {
    label: 'JC Veo3.1 Components', tasks: ['text-video', 'image-video'], action: 'generate', provider: 'newapi',
    modelName: 'veo3.1-components',
    ar: ['16:9', '9:16'], res: [], defRes: '', fixedDuration: 8,
    price: { '': 60 },
  },
  'newapi-suno': {
    label: 'JC Suno Music', tasks: ['text-music'], action: 'generate', provider: 'newapi-suno',
    modelName: 'suno_music',
    ar: [], res: [], defRes: '',
    price: { '': 100 },
  },

  // ═══ SD2 新渠道 ═══
  'sd2-fast': {
    label: 'Seedance 2.0 Fast (新渠道)', tasks: ['text-video', 'image-video', 'firstlast-video', 'multimodal-video'], action: 'generate', provider: 'sd2-platform',
    modelName: 'seedance-2.0-fast',
    ar: ['4:3', '16:9', '9:16', '1:1', '21:9', '3:4', '2:3', '3:2'], res: [], defRes: '',
    dur: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], defDur: 5,
    priceUnit: 'per-second', price: { '': 70 },
  },
}

// ─── 工具函数 ───
export function getModelsForTask(task: CreationTask): string[] {
  return Object.keys(RH_CREATION_MODELS).filter(k => RH_CREATION_MODELS[k].tasks.includes(task))
}

export function getAspectOptions(model: CreationModel, task: CreationTask): string[] {
  if (model.arByTask && model.arByTask[task]) return model.arByTask[task]
  return model.ar || []
}

export function getDefaultAspect(model: CreationModel, task: CreationTask): string {
  if (model.defArByTask && model.defArByTask[task]) return model.defArByTask[task]
  return model.defAr || (getAspectOptions(model, task)[0] || '')
}

export function getResolutionOptions(model: CreationModel, task: CreationTask): string[] {
  if (model.resByTask && model.resByTask[task]) return model.resByTask[task]
  return model.res || []
}

export function getDefaultResolution(model: CreationModel, task: CreationTask): string {
  if (model.defResByTask && model.defResByTask[task]) return model.defResByTask[task]
  return model.defRes || (getResolutionOptions(model, task)[0] || '')
}
