/**
 * api/media-generation.ts — 终极版（基于 NewAPI 源码验证）
 *
 * 路由表（来自 MYnewapi/router/ 源码验证）：
 * ┌─────────────────┬──────────────────────────────┬─────────────────────────────────┐
 * │ 模型            │ 提交                          │ 轮询                             │
 * ├─────────────────┼──────────────────────────────┼─────────────────────────────────┤
 * │ gpt-image-2     │ POST /v1/images/generations   │ 同步（无需轮询）                  │
 * │ gpt-image-2 编辑│ POST /v1/images/edits         │ 同步                             │
 * │ grok / veo      │ POST /v1/video/generations     │ GET /v1/video/generations/:id    │
 * │ seedance        │ POST /v1/videos                │ GET /v1/videos/:id               │
 * │ suno            │ POST /suno/submit/music         │ GET /suno/fetch/:id              │
 * └─────────────────┴──────────────────────────────┴─────────────────────────────────┘
 */

// ---- Types ----
export interface ImageGenParams {
  model: string
  prompt: string
  size?: string
  aspectRatio?: string
  resolution?: string
  image?: string        // base64 data URL or File blob for image-to-image
}

export interface VideoGenParams {
  model: string
  prompt: string
  aspectRatio?: string
  resolution?: string
  duration?: string | number
  imageUrl?: string
}

export interface MediaResult {
  url: string
  type: 'image' | 'video' | 'audio'
  taskId?: string
}

// ---- API Config ----

const BASE_URL = 'https://api.jiucaihezi.studio'

function getApiKey(): string {
  return localStorage.getItem('jcApiKey') || ''
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`,
  }
}

// ---- Size Mapping (V4/V5 verified) ----

function mapGptImageSize(ar: string, res?: string): string {
  const is4k = res === '4k'
  const is2k = res === '2k'
  let ratio = ar
  if (ratio === '3:2') ratio = '16:9'
  if (ratio === '2:3') ratio = '9:16'
  switch (ratio) {
    case '1:1': return (is2k || is4k) ? '2048x2048' : '1024x1024'
    case '16:9': return is4k ? '3840x2160' : (is2k ? '2048x1152' : '1536x1024')
    case '9:16': return is4k ? '2160x3840' : (is2k ? '1152x2048' : '1024x1536')
    default: return '1024x1024'
  }
}

// ---- Extractors (V5 production-proven, deep recursive) ----

function extractMediaUrl(payload: any, kind: 'image' | 'video' | 'audio' = 'image'): string {
  function pick(obj: any): string {
    if (!obj || typeof obj !== 'object') return ''
    const direct = obj.url || obj.video_url || obj.videoUrl ||
                   obj.audio_url || obj.audioUrl || obj.output ||
                   obj.image_url || obj.imageUrl
    if (typeof direct === 'string' && direct) return direct
    for (const key of ['video_url', 'audio_url', 'image_url', 'content']) {
      if (obj[key] && typeof obj[key] === 'object' && obj[key].url) return obj[key].url
    }
    if (Array.isArray(obj.content)) {
      for (const item of obj.content) { const u = pick(item); if (u) return u }
    }
    for (const arrKey of ['results', 'urls']) {
      if (Array.isArray(obj[arrKey])) {
        for (const item of obj[arrKey]) {
          if (typeof item === 'string' && item) return item
          const u = pick(item); if (u) return u
        }
      }
    }
    return ''
  }

  const data = payload?.data
  if (Array.isArray(data)) {
    for (const item of data) {
      const u = pick(item); if (u) return u
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
    }
  } else if (data) {
    const u = pick(data); if (u) return u
    if (data.b64_json) return `data:image/png;base64,${data.b64_json}`
    if (data.data && typeof data.data === 'object') {
      const nestedU = pick(data.data); if (nestedU) return nestedU
      if (Array.isArray(data.data.data)) {
        for (const item of data.data.data) {
          const u2 = pick(item); if (u2) return u2
          if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
        }
      }
    }
  }
  const payloadU = pick(payload); if (payloadU) return payloadU
  const choices = payload?.choices
  if (Array.isArray(choices) && choices[0]) {
    const parts = choices[0].message?.content
    if (Array.isArray(parts)) {
      for (const part of parts) { const u = pick(part); if (u) return u }
    }
  }
  return ''
}

function extractTaskId(data: any): string {
  if (typeof data?.data === 'string' && data.data.length > 0) return data.data
  const d = data?.data
  if (d && !Array.isArray(d)) {
    const v = d.task_id || d.taskId || d.id; if (v) return String(v)
  }
  if (Array.isArray(d) && d[0]) {
    const v = d[0].task_id || d[0].taskId || d[0].id; if (v) return String(v)
  }
  const direct = data?.task_id || data?.taskId || data?.id
  return direct ? String(direct) : ''
}

function extractStatus(data: any): string {
  const d = data?.data
  return String(
    (d && !Array.isArray(d) && d.status) ||
    (Array.isArray(d) && d[0]?.status) ||
    data?.status || ''
  )
}

// ---- Core Fetch Helpers ----

async function apiCall(path: string, body: any | null, method = 'POST'): Promise<any> {
  const key = getApiKey()
  if (!key) throw new Error('请先配置 API Key')
  const opts: RequestInit = { method, headers: authHeaders() }
  if (method !== 'GET' && body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function apiCallMultipart(path: string, fields: Record<string, string | Blob>): Promise<any> {
  const key = getApiKey()
  if (!key) throw new Error('请先配置 API Key')
  const formData = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) formData.append(k, v, 'image.png')
    else formData.append(k, v)
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png'
  const byteString = atob(parts[1] || '')
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// ---- Unified Task Poller ----

async function pollTask(
  pollPath: string,
  kind: 'image' | 'video' | 'audio',
  onProgress?: (elapsed: number, status: string) => void,
  maxPollsSec = 3000,
  intervalMs = 10000,
): Promise<string> {
  const maxPolls = Math.ceil(maxPollsSec / (intervalMs / 1000))
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    const data = await apiCall(pollPath, null, 'GET')
    const status = extractStatus(data)
    const elapsed = (i + 1) * (intervalMs / 1000)
    onProgress?.(elapsed, status || 'PROCESSING')
    if (/^(completed|complete|success|succeeded|done)$/i.test(status)) {
      const url = extractMediaUrl(data, kind)
      if (url) return url
    }
    if (/^(failed|failure|fail|error)$/i.test(status)) {
      const err = data.fail_reason || data.failReason || data.error?.message || data.error || '生成失败'
      throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
    }
  }
  throw new Error(`生成超时 (${Math.round(maxPollsSec / 60)}分钟)`)
}

// ======================================================================
// PUBLIC API
// ======================================================================

/**
 * 生成图片 — gpt-image-2
 * 同步模式：NewAPI 服务端等待 T8 返回（Go 协程无超时限制）
 * 路由: POST /v1/images/generations 或 /v1/images/edits
 */
export async function generateImage(
  params: ImageGenParams,
  onProgress?: (elapsed: number, status: string) => void,
): Promise<MediaResult> {
  const { model, prompt, image, aspectRatio, resolution } = params

  if (model === 'gpt-image-2' && image) {
    // ── 以图生图 → multipart /v1/images/edits ──
    const size = mapGptImageSize(aspectRatio || '1:1', resolution)
    const fields: Record<string, string | Blob> = {
      model, prompt, size, response_format: 'url',
    }
    if (image.startsWith('data:')) {
      fields.image = dataUrlToBlob(image)
    } else {
      try { const imgRes = await fetch(image); fields.image = await imgRes.blob() }
      catch { fields.image = image }
    }
    const data = await apiCallMultipart('/v1/images/edits', fields)
    const mediaUrl = extractMediaUrl(data, 'image')
    if (!mediaUrl) throw new Error('以图生图未获取到结果')
    return { url: mediaUrl, type: 'image' }
  }

  // ── 文生图 → JSON /v1/images/generations ──
  const size = mapGptImageSize(aspectRatio || '1:1', resolution)
  const body: any = { model, prompt, n: 1, size, response_format: 'url' }
  onProgress?.(0, '提交中')
  const data = await apiCall('/v1/images/generations', body)
  const mediaUrl = extractMediaUrl(data, 'image')
  if (!mediaUrl) throw new Error('未获取到图像结果（响应: ' + JSON.stringify(data).slice(0, 200) + '）')
  return { url: mediaUrl, type: 'image' }
}

/**
 * 生成视频 — grok-video-3 / veo3.1 / seedance
 *
 * grok/veo → POST /v1/video/generations → GET /v1/video/generations/:id
 * seedance → POST /v1/videos → GET /v1/videos/:id
 */
export async function generateVideo(
  params: VideoGenParams,
  onProgress?: (elapsed: number, status: string) => void,
): Promise<MediaResult> {
  const { model, prompt, aspectRatio, resolution, duration, imageUrl } = params

  // ── Seedance 系列 → /v1/videos ──
  if (model.startsWith('seedance')) {
    const body: any = { model, prompt, duration: Number(duration) || 5, ratio: aspectRatio || '16:9' }
    if (imageUrl) { body.reference_mode = 'omni_reference'; body.image_file_1 = imageUrl }

    const data = await apiCall('/v1/videos', body)
    let mediaUrl = extractMediaUrl(data, 'video')
    if (!mediaUrl) {
      const taskId = extractTaskId(data)
      if (taskId) mediaUrl = await pollTask(`/v1/videos/${taskId}`, 'video', onProgress, 3000, 15000)
    }
    if (!mediaUrl) throw new Error('Seedance 视频生成失败')
    return { url: mediaUrl, type: 'video' }
  }

  // ── Grok / Veo / 其他 → /v1/video/generations ──
  const body: any = { model, prompt }
  if (aspectRatio) body.ratio = aspectRatio
  if (resolution) body.resolution = resolution.toUpperCase()
  if (duration) body.duration = Number(duration)
  if (imageUrl) body.images = [imageUrl]

  const data = await apiCall('/v1/video/generations', body)
  let mediaUrl = extractMediaUrl(data, 'video')
  if (!mediaUrl) {
    const taskId = extractTaskId(data)
    if (taskId) mediaUrl = await pollTask(`/v1/video/generations/${taskId}`, 'video', onProgress, 3000, 15000)
  }
  if (!mediaUrl) throw new Error('视频生成失败')
  return { url: mediaUrl, type: 'video' }
}

/**
 * 生成音乐 — Suno 5.5
 * POST /suno/submit/music → GET /suno/fetch/:id
 */
export async function generateAudio(prompt: string): Promise<MediaResult> {
  const key = getApiKey()
  if (!key) throw new Error('请先配置 API Key')

  // Step 1: 提交 → /suno/submit/music (NewAPI relay-router.go:184)
  const body = { gpt_description_prompt: prompt, mv: 'chirp-fenix' }
  const submitRes = await fetch(`${BASE_URL}/suno/submit/music`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  })
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '')
    throw new Error(`Suno 提交失败 (${submitRes.status}): ${errText.slice(0, 200)}`)
  }
  const submitData = await submitRes.json()

  // 提取 task_id — NewAPI 的 RelayTask 返回格式
  const taskId = extractTaskId(submitData)
  if (!taskId) {
    // 也尝试 clips 格式（兼容）
    const clips = submitData?.clips || submitData?.data?.clips || []
    if (clips.length === 0) throw new Error('Suno 未返回任务 ID 或 clips')
    // Fallback: 用 clips[0].id 轮询
    const clipId = clips[0]?.id
    if (clipId) {
      return await pollSunoByClipId(clipId)
    }
    throw new Error('Suno 未返回有效的任务标识')
  }

  // Step 2: 轮询 → /suno/fetch/:id (NewAPI relay-router.go:186)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`${BASE_URL}/suno/fetch/${taskId}`, {
      method: 'GET', headers: authHeaders(),
    })
    if (!pollRes.ok) continue
    const pollData = await pollRes.json()

    // RelayTaskFetch 可能返回单个对象或数组
    const items = Array.isArray(pollData) ? pollData
      : Array.isArray(pollData?.data) ? pollData.data
      : pollData?.data ? [pollData.data] : [pollData]

    for (const clip of items) {
      const status = String(clip.status || '').toLowerCase()
      if (status === 'complete' || status === 'completed' || status === 'success') {
        const audioUrl = clip.audio_url || clip.video_url || extractMediaUrl(clip, 'audio')
        if (audioUrl) return { url: audioUrl, type: 'audio' }
      }
      if (status === 'error' || status === 'failed') {
        throw new Error(clip.error_message || clip.fail_reason || 'Suno 生成失败')
      }
    }
  }
  throw new Error('Suno 生成超时（10分钟）')
}

/** Fallback: 用 clip ID 直接轮询（兼容旧 API） */
async function pollSunoByClipId(clipId: string): Promise<MediaResult> {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`${BASE_URL}/suno/fetch/${clipId}`, {
      method: 'GET', headers: authHeaders(),
    })
    if (!res.ok) continue
    const data = await res.json()
    const items = Array.isArray(data) ? data : data?.data ? [data.data] : [data]
    for (const clip of items) {
      if (clip.status === 'complete' || clip.status === 'completed') {
        const audioUrl = clip.audio_url || clip.video_url
        if (audioUrl) return { url: audioUrl, type: 'audio' }
      }
      if (clip.status === 'error' || clip.status === 'failed') {
        throw new Error(clip.error_message || 'Suno 生成失败')
      }
    }
  }
  throw new Error('Suno 生成超时')
}
