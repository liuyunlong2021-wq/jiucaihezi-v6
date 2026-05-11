/**
 * api/media-generation.ts — 移植自 V5 生产验证版
 * 唯一改动：API 配置从 useNewChatStore → localStorage
 */

// ---- Types ----
export interface ImageGenParams {
  model: string
  prompt: string
  size?: string
  aspectRatio?: string
  resolution?: string
  image?: string        // base64 data URL for image-to-image
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

// ---- Helpers ----

function getApiConfig() {
  return {
    baseUrl: 'https://api.jiucaihezi.studio',
    apiKey: localStorage.getItem('jcApiKey') || '',
  }
}

function getHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

/** GPT Size Mapping — V5 原样复制 */
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

/** 多层 task_id 提取 — V5 原样复制 */
function extractTaskId(data: any): string {
  if (typeof data?.data === 'string' && data.data.length > 0) return data.data
  const d = data?.data
  if (d && !Array.isArray(d)) {
    const v = d.task_id || d.taskId || d.id
    if (v) return String(v)
  }
  if (Array.isArray(d) && d[0]) {
    const v = d[0].task_id || d[0].taskId || d[0].id
    if (v) return String(v)
  }
  const direct = data?.task_id || data?.taskId || data?.id
  return direct ? String(direct) : ''
}

/** 深度递归提取媒体 URL — V5 原样复制 */
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

function extractStatus(data: any): string {
  const d = data?.data
  return String(
    (d && !Array.isArray(d) && d.status) ||
    (Array.isArray(d) && d[0]?.status) ||
    data?.status || ''
  )
}

// ---- Core API Functions ----

async function apiCall(path: string, body: any | null, method = 'POST'): Promise<any> {
  const { baseUrl, apiKey } = getApiConfig()
  if (!apiKey) throw new Error('请先配置 API Key')
  const hdrs = getHeaders(apiKey)
  const opts: RequestInit = { method, headers: hdrs }
  if (method !== 'GET' && body) opts.body = JSON.stringify(body)
  const res = await fetch(`${baseUrl}${path}`, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function apiCallMultipart(path: string, fields: Record<string, string | Blob>): Promise<any> {
  const { baseUrl, apiKey } = getApiConfig()
  if (!apiKey) throw new Error('请先配置 API Key')
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) formData.append(key, value, 'image.png')
    else formData.append(key, value)
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
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

/** 统一轮询 — V5 原样复制 */
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

// ---- Public API (V5 原样复制) ----

export async function generateImage(
  params: ImageGenParams,
  onProgress?: (elapsed: number, status: string) => void,
): Promise<MediaResult> {
  const { model, prompt, image, aspectRatio, resolution } = params
  let path: string
  let body: any

  if (model === 'gpt-image-2') {
    const size = mapGptImageSize(aspectRatio || '1:1', resolution)
    if (image) {
      const fields: Record<string, string | Blob> = {
        model, prompt, size, response_format: 'url',
      }
      if (image.startsWith('data:')) {
        fields.image = dataUrlToBlob(image)
      } else {
        try { const imgRes = await fetch(image); fields.image = await imgRes.blob() }
        catch { fields.image = image }
      }
      path = '/v1/images/edits'
      const data = await apiCallMultipart(path, fields)
      let mediaUrl = extractMediaUrl(data, 'image')
      if (!mediaUrl) {
        const taskId = extractTaskId(data)
        if (taskId) {
          mediaUrl = await pollTask(`/v1/images/generations/${taskId}`, 'image', onProgress)
        }
      }
      if (!mediaUrl) throw new Error('以图生图未获取到结果')
      return { url: mediaUrl, type: 'image' }
    } else {
      path = '/v1/images/generations'
      body = { model, prompt, n: 1, size, response_format: 'url' }
    }
  } else {
    const size = aspectRatio ? mapGptImageSize(aspectRatio, resolution) : '1024x1024'
    path = '/v1/images/generations'
    body = { model, prompt, n: 1, size, response_format: 'url' }
  }

  const data = await apiCall(path, body)
  let mediaUrl = extractMediaUrl(data, 'image')

  // ★ V5 策略: 先尝试同步拿 URL，拿不到才轮询
  if (!mediaUrl) {
    const taskId = extractTaskId(data)
    if (taskId) {
      mediaUrl = await pollTask(`/v1/images/generations/${taskId}`, 'image', onProgress)
    }
  }
  if (!mediaUrl) throw new Error('未获取到图像结果')
  return { url: mediaUrl, type: 'image' }
}

export async function generateVideo(
  params: VideoGenParams,
  onProgress?: (elapsed: number, status: string) => void,
): Promise<MediaResult> {
  const { model, prompt, aspectRatio, resolution, duration, imageUrl } = params

  // Grok video
  if (model.startsWith('grok-video')) {
    const body: any = { model, prompt }
    if (aspectRatio) body.ratio = aspectRatio
    if (resolution) body.resolution = resolution.toUpperCase()
    if (duration) body.duration = Number(duration)
    if (imageUrl) body.images = [imageUrl]

    const data = await apiCall('/v2/videos/generations', body)
    let mediaUrl = extractMediaUrl(data, 'video')
    if (!mediaUrl) {
      const taskId = extractTaskId(data)
      if (taskId) mediaUrl = await pollTask(`/v2/videos/generations/${taskId}`, 'video', onProgress, 3000, 15000)
    }
    if (!mediaUrl) throw new Error('Grok 视频生成失败')
    return { url: mediaUrl, type: 'video' }
  }

  // Seedance
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

  // Veo / Other: generic v2 endpoint
  const body: any = { model, prompt }
  if (aspectRatio) body.ratio = aspectRatio
  if (resolution) body.resolution = resolution.toUpperCase()
  if (duration) body.duration = Number(duration)
  if (imageUrl) body.images = [imageUrl]

  const data = await apiCall('/v2/videos/generations', body)
  let mediaUrl = extractMediaUrl(data, 'video')
  if (!mediaUrl) {
    const taskId = extractTaskId(data)
    if (taskId) mediaUrl = await pollTask(`/v2/videos/generations/${taskId}`, 'video', onProgress, 3000, 15000)
  }
  if (!mediaUrl) throw new Error('未获取到视频结果')
  return { url: mediaUrl, type: 'video' }
}

export async function generateAudio(prompt: string): Promise<MediaResult> {
  const { baseUrl, apiKey } = getApiConfig()
  if (!apiKey) throw new Error('请先配置 API Key')

  const body = { gpt_description_prompt: prompt, mv: 'chirp-v4' }
  const submitRes = await fetch(`${baseUrl}/suno/generate`, {
    method: 'POST', headers: getHeaders(apiKey), body: JSON.stringify(body),
  })
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '')
    throw new Error(`Suno 提交失败 (${submitRes.status}): ${errText.slice(0, 200)}`)
  }
  const submitData = await submitRes.json()
  const clips = submitData?.clips || submitData?.data?.clips || []
  if (clips.length === 0) throw new Error('Suno 未返回音乐片段')
  const clipIds = clips.map((c: any) => c.id).join(',')

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`${baseUrl}/suno/feed/${clipIds}`, {
      method: 'GET', headers: getHeaders(apiKey),
    })
    if (!pollRes.ok) continue
    const pollData = await pollRes.json()
    const feedClips = Array.isArray(pollData) ? pollData : (pollData?.data || [])
    for (const clip of feedClips) {
      if (clip.status === 'complete' || clip.status === 'completed') {
        const audioUrl = clip.audio_url || clip.video_url
        if (audioUrl) return { url: audioUrl, type: 'audio' }
      }
      if (clip.status === 'error' || clip.status === 'failed') {
        throw new Error(clip.error_message || 'Suno 音乐生成失败')
      }
    }
  }
  throw new Error('Suno 音乐生成超时')
}
