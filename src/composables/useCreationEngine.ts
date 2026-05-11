/**
 * useCreationEngine.ts — 创作引擎（并发版）
 * 
 * 核心调用委托给 NewAPI 源码验证的 media-generation.ts
 * 支持连续生成（V4 的 _cpRunningTasks 模式）
 */
import { cpState, currentModel, addResult } from '@/composables/useCreation'
import { RH_CREATION_MODELS } from '@/data/creationModels'
import { generateImage, generateVideo, generateAudio } from '@/api/media-generation'

// ─── 主入口（fire-and-forget，支持并发） ───
export function runCreation() {
  const m = currentModel.value
  if (!m) { alert('请先选择模型'); return }
  if (!cpState.prompt.trim() && m.provider !== 'newapi-suno') {
    alert('请输入提示词'); return
  }

  // 快照参数（允许用户在生成中修改参数继续提交）
  const snapshot = {
    modelKey: cpState.modelKey,
    prompt: cpState.prompt,
    task: cpState.task,
    ar: cpState.ar,
    size: cpState.size,
    res: cpState.res,
    dur: cpState.dur,
    files: [...cpState.files],
  }

  // 并发计数器 +1
  cpState.runningTasks++
  cpState.generating = cpState.runningTasks > 0
  cpState.progressText = `${cpState.runningTasks}个任务生成中...`

  // Fire-and-forget: 不 await，允许连续点击
  _executeCreation(snapshot).finally(() => {
    cpState.runningTasks--
    cpState.generating = cpState.runningTasks > 0
    if (cpState.runningTasks > 0) {
      cpState.progressText = `${cpState.runningTasks}个任务生成中...`
    } else {
      cpState.progress = 0
      cpState.progressText = ''
    }
  })
}

// ─── 实际执行（每个任务独立） ───
async function _executeCreation(snap: {
  modelKey: string; prompt: string; task: string;
  ar: string; size: string; res: string; dur: number; files: File[];
}) {
  const modelDef = RH_CREATION_MODELS[snap.modelKey]
  if (!modelDef) throw new Error(`未知模型: ${snap.modelKey}`)

  // 从 provider 推断类型
  const mediaType = modelDef.provider === 'newapi-image' ? 'image'
    : modelDef.provider === 'newapi-suno' ? 'audio' : 'video'

  const onProgress = (elapsed: number, status: string) => {
    cpState.progressText = `${cpState.runningTasks}个任务 · ${Math.round(elapsed)}s · ${status}`
  }

  try {
    if (mediaType === 'image') {
      // 智能检测：有文件就自动当图生图（不依赖 task 选择器）
      const hasRefImage = snap.files.length > 0
      const imageParam = hasRefImage
        ? await fileToDataUrl(snap.files[0])
        : undefined

      const result = await generateImage({
        model: modelDef.modelName,
        prompt: snap.prompt,
        size: snap.size !== 'auto' ? snap.size : undefined,
        aspectRatio: snap.ar || '1:1',
        resolution: snap.res || '1k',
        image: imageParam,
      }, onProgress)

      addResult({ url: result.url, type: 'image', model: modelDef.label, task: hasRefImage ? 'image-image' : 'text-image', ts: Date.now() })

    } else if (mediaType === 'video') {
      // 智能检测：有文件就自动当图生视频
      const hasRefImage = snap.files.length > 0
      const imageUrl = hasRefImage
        ? await fileToDataUrl(snap.files[0])
        : undefined

      const result = await generateVideo({
        model: modelDef.modelName,
        prompt: snap.prompt,
        aspectRatio: snap.ar || '16:9',
        resolution: snap.res,
        duration: snap.dur,
        imageUrl,
      }, onProgress)

      addResult({ url: result.url, type: 'video', model: modelDef.label, task: hasRefImage ? 'image-video' : 'text-video', ts: Date.now() })

    } else if (mediaType === 'audio') {
      const result = await generateAudio(snap.prompt)
      addResult({ url: result.url, type: 'audio', model: modelDef.label, task: 'text-music', ts: Date.now() })
    }
  } catch (e: any) {
    alert('生成失败: ' + (e.message || e))
    console.error('Creation engine error:', e)
  }
}

// ─── 工具 ───
async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}
