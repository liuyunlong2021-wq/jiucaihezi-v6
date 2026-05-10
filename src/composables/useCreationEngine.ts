/**
 * useCreationEngine.ts — 创作引擎
 *
 * 对接 4 个 API 平台:
 * 1. newapi-image: T8 gpt-image-2 (POST /v1/images/generations?async=true → 轮询 /v1/images/tasks/{id})
 * 2. newapi-video: T8 grok/veo (POST /v2/videos/generations → 轮询 /v2/videos/generations/{id})
 * 3. sd2: Seedance 2.0 (POST /v1/videos → 轮询 /v1/videos/{id})
 * 4. newapi-suno: Suno (POST /suno/generate → GET /suno/feed/{ids})
 */
import { cpState, currentModel, addResult, type CreationResult } from '@/composables/useCreation'
import { RH_CREATION_MODELS } from '@/data/creationModels'

// ─── 配置 ───
const T8_BASE = 'https://api.jiucaihezi.studio'
const SD2_BASE = 'https://sd2.mengfactory.cn'

function getApiKey(): string {
  return localStorage.getItem('jcApiKey') || ''
}

function headers(base: 'T8' | 'SD2' = 'T8'): Record<string, string> {
  const key = getApiKey()
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

// ─── 主入口 ───
export async function runCreation() {
  const m = currentModel.value
  if (!m) { alert('请先选择模型'); return }
  if (!cpState.prompt.trim() && m.provider !== 'newapi-suno') {
    alert('请输入提示词'); return
  }

  cpState.generating = true
  cpState.progress = 0
  cpState.progressText = '提交中...'

  try {
    switch (m.provider) {
      case 'newapi-image':
        await runImageGeneration(); break
      case 'newapi-video':
        await runVideoGeneration(); break
      case 'sd2':
        await runSd2Generation(); break
      case 'newapi-suno':
        await runSunoGeneration(); break
    }
  } catch (e: any) {
    alert('生成失败: ' + (e.message || e))
    console.error('Creation engine error:', e)
  } finally {
    cpState.generating = false
    cpState.progress = 0
    cpState.progressText = ''
  }
}

// ═══ 1. GPT Image 2 ═══
// T8gpt2.md: POST /v1/images/generations?async=true → 轮询 /v1/images/tasks/{task_id}
async function runImageGeneration() {
  const m = RH_CREATION_MODELS[cpState.modelKey]
  const isEdit = cpState.task === 'image-image' && cpState.files.length > 0

  let taskId: string

  if (isEdit) {
    // 图生图: multipart/form-data → /v1/images/edits?async=true
    const fd = new FormData()
    fd.append('model', m.modelName)
    fd.append('prompt', cpState.prompt)
    if (cpState.size && cpState.size !== 'auto') fd.append('size', cpState.size)
    fd.append('response_format', 'url')
    cpState.files.forEach(f => fd.append('image', f))

    const key = getApiKey()
    const resp = await fetch(`${T8_BASE}/v1/images/edits?async=true`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: fd,
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`图片编辑提交失败 (${resp.status}): ${errText.slice(0, 200)}`)
    }
    const json = await resp.json()
    taskId = json.data || json.task_id
  } else {
    // 文生图: JSON → /v1/images/generations?async=true
    const body: any = {
      model: m.modelName,
      prompt: cpState.prompt,
      response_format: 'url',
    }
    if (cpState.size && cpState.size !== 'auto') body.size = cpState.size

    const resp = await fetch(`${T8_BASE}/v1/images/generations?async=true`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`提交失败 (${resp.status}): ${errText.slice(0, 200)}`)
    }
    const json = await resp.json()
    taskId = json.data || json.task_id
  }

  if (!taskId) throw new Error('未获取到 task_id')
  cpState.progressText = '生成中...'

  // 轮询: GET /v1/images/tasks/{task_id}
  const result = await pollImageTask(taskId)
  if (result) {
    addResult({ url: result, type: 'image', model: m.label, task: cpState.task, ts: Date.now() })
  }
}

async function pollImageTask(taskId: string): Promise<string | null> {
  for (let i = 0; i < 120; i++) {
    await sleep(3000)
    cpState.progress = Math.min(95, (i / 120) * 100)
    cpState.progressText = `生成中... (${Math.round(cpState.progress)}%)`

    const resp = await fetch(`${T8_BASE}/v1/images/tasks/${taskId}`, { headers: headers() })
    const json = await resp.json()
    const d = json.data || json
    const status = d.status || ''

    if (status === 'SUCCESS') {
      cpState.progress = 100
      const imgs = d.data?.data || []
      return imgs[0]?.url || imgs[0]?.b64_json || null
    }
    if (status === 'FAILURE') throw new Error(d.fail_reason || '图片生成失败')
  }
  throw new Error('图片生成超时')
}

// ═══ 2. Grok / Veo Video ═══
// T8grok.md: POST /v2/videos/generations → { task_id } → GET /v2/videos/generations/{task_id}
// status: NOT_START / IN_PROGRESS / SUCCESS / FAILURE
async function runVideoGeneration() {
  const m = RH_CREATION_MODELS[cpState.modelKey]
  const body: any = {
    model: m.modelName,
    prompt: cpState.prompt,
  }
  if (cpState.ar) body.ratio = cpState.ar
  if (m.res?.length && cpState.res) body.resolution = cpState.res
  if (m.dur?.length && cpState.dur) body.duration = cpState.dur

  // 图片参考
  if (cpState.task === 'image-video' && cpState.files.length > 0) {
    const base64s = await Promise.all(cpState.files.map(fileToBase64))
    body.images = base64s
  }

  const resp = await fetch(`${T8_BASE}/v2/videos/generations`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`视频提交失败 (${resp.status}): ${errText.slice(0, 200)}`)
  }
  const json = await resp.json()
  const taskId = json.task_id
  if (!taskId) throw new Error('未获取到 task_id')

  cpState.progressText = '视频生成中...'
  const result = await pollVideoTask(taskId)
  if (result) {
    addResult({ url: result, type: 'video', model: m.label, task: cpState.task, ts: Date.now() })
  }
}

async function pollVideoTask(taskId: string): Promise<string | null> {
  for (let i = 0; i < 180; i++) {
    await sleep(5000)
    cpState.progress = Math.min(95, (i / 180) * 100)
    cpState.progressText = `视频生成中... (${Math.round(cpState.progress)}%)`

    const resp = await fetch(`${T8_BASE}/v2/videos/generations/${taskId}`, { headers: headers() })
    const json = await resp.json()
    const status = json.status || ''

    if (status === 'SUCCESS') {
      cpState.progress = 100
      const urls = json.urls || json.data?.urls || []
      return json.url || urls[0] || null
    }
    if (status === 'FAILURE') throw new Error(json.error || json.fail_reason || '视频生成失败')
  }
  throw new Error('视频生成超时')
}

// ═══ 3. Seedance 2.0 (SD2 平台) ═══
// seedance-2.0-fast-use-guide.md: POST /v1/videos → { task_id } → GET /v1/videos/{task_id}
// status: queued / submitting / queueing / processing / succeeded / failed
async function runSd2Generation() {
  const m = RH_CREATION_MODELS[cpState.modelKey]
  const body: any = {
    model: m.modelName,
    prompt: cpState.prompt,
    duration: cpState.dur,
  }
  if (cpState.ar) body.ratio = cpState.ar

  // 图片参考 → 使用 URL 模式或 multipart
  if (cpState.task === 'image-video' && cpState.files.length > 0) {
    // 使用 multipart 上传
    const fd = new FormData()
    fd.append('model', m.modelName)
    fd.append('prompt', cpState.prompt)
    fd.append('duration', String(cpState.dur))
    if (cpState.ar) fd.append('ratio', cpState.ar)
    fd.append('reference_mode', 'omni_reference')
    cpState.files.forEach((f, i) => fd.append(`image_file_${i + 1}`, f))

    const key = getApiKey()
    const resp = await fetch(`${SD2_BASE}/v1/videos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: fd,
    })
    const json = await resp.json()
    const taskId = json.task_id
    if (!taskId) throw new Error('未获取到 task_id')

    cpState.progressText = '视频生成中...'
    const result = await pollSd2Task(taskId)
    if (result) addResult({ url: result, type: 'video', model: m.label, task: cpState.task, ts: Date.now() })
    return
  }

  // 纯文生视频
  const resp = await fetch(`${SD2_BASE}/v1/videos`, {
    method: 'POST',
    headers: { ...headers('SD2') },
    body: JSON.stringify(body),
  })
  const json = await resp.json()
  const taskId = json.task_id
  if (!taskId) throw new Error('未获取到 task_id')

  cpState.progressText = '视频生成中...'
  const result = await pollSd2Task(taskId)
  if (result) addResult({ url: result, type: 'video', model: m.label, task: cpState.task, ts: Date.now() })
}

async function pollSd2Task(taskId: string): Promise<string | null> {
  // 轮询间隔 15s，最多 12 分钟
  for (let i = 0; i < 48; i++) {
    await sleep(15000)
    cpState.progress = Math.min(95, (i / 48) * 100)
    cpState.progressText = `视频生成中... (${Math.round(cpState.progress)}%)`

    try {
      const resp = await fetch(`${SD2_BASE}/v1/videos/${taskId}`, { headers: headers('SD2') })
      if (resp.status === 521) continue // Cloudflare 521 → 继续轮询
      const json = await resp.json()
      const status = json.status || ''

      if (status === 'succeeded') {
        cpState.progress = 100
        return json.url || (json.urls && json.urls[0]) || null
      }
      if (status === 'failed') throw new Error(json.error || '视频生成失败')
      // 其他状态继续轮询
      if (json.progress?.message) cpState.progressText = json.progress.message
    } catch (e: any) {
      if (e.message?.includes('生成失败')) throw e
      // 网络错误继续轮询
    }
  }
  throw new Error('视频生成超时（12分钟）')
}

// ═══ 4. Suno Music ═══
// T8suno.md: POST /suno/generate → { clips: [{ id }] } → GET /suno/feed/{id1,id2}
async function runSunoGeneration() {
  const m = RH_CREATION_MODELS[cpState.modelKey]
  const body: any = {
    mv: m.sunoMv || 'chirp-fenix',
  }

  if (cpState.tags) {
    // 自定义模式
    body.prompt = cpState.prompt
    body.tags = cpState.tags
    body.title = cpState.title || '未命名'
    body.generation_type = 'TEXT'
  } else {
    // 灵感模式
    body.gpt_description_prompt = cpState.prompt
  }

  const resp = await fetch(`${T8_BASE}/suno/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const json = await resp.json()
  const clips = json.clips || []
  if (!clips.length) throw new Error('Suno 未返回 clips')

  const clipIds = clips.map((c: any) => c.id).join(',')
  cpState.progressText = '音乐生成中...'

  // 轮询 feed
  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    cpState.progress = Math.min(95, (i / 60) * 100)
    cpState.progressText = `音乐生成中... (${Math.round(cpState.progress)}%)`

    const feedResp = await fetch(`${T8_BASE}/suno/feed/${clipIds}`, { headers: headers() })
    const feedData = await feedResp.json()
    const items = Array.isArray(feedData) ? feedData : []

    const completed = items.filter((c: any) => c.status === 'complete' && c.audio_url)
    if (completed.length > 0) {
      cpState.progress = 100
      for (const c of completed) {
        addResult({ url: c.audio_url, type: 'audio', model: m.label, task: 'text-music', ts: Date.now() })
      }
      return
    }
    const failed = items.filter((c: any) => c.status === 'error')
    if (failed.length === items.length) throw new Error('Suno 生成失败')
  }
  throw new Error('Suno 生成超时')
}

// ─── 工具 ───
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // data:image/png;base64,xxxxx → xxxxx
      resolve(result.split(',')[1] || result)
    }
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}
