/**
 * useCreationEngine.ts — 创作引擎（V5 移植版）
 * 
 * 核心调用全部委托给 V5 生产验证的 media-generation.ts
 * 本文件只负责 UI 状态管理和参数映射
 */
import { cpState, currentModel, addResult } from '@/composables/useCreation'
import { RH_CREATION_MODELS } from '@/data/creationModels'
import { generateImage, generateVideo, generateAudio } from '@/api/media-generation'

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
    const modelDef = RH_CREATION_MODELS[cpState.modelKey]
    if (!modelDef) throw new Error(`未知模型: ${cpState.modelKey}`)

    // 从 provider 推断类型
    const mediaType = modelDef.provider === 'newapi-image' ? 'image'
      : modelDef.provider === 'newapi-suno' ? 'audio' : 'video'

    const onProgress = (elapsed: number, status: string) => {
      cpState.progress = Math.min(95, elapsed / 300 * 100)
      cpState.progressText = `${status}... (${Math.round(elapsed)}秒)`
    }

    if (mediaType === 'image') {
      // 图片生成 — 使用 V5 的 generateImage
      const imageParam = cpState.task === 'image-image' && cpState.files.length > 0
        ? await fileToDataUrl(cpState.files[0])
        : undefined

      const result = await generateImage({
        model: modelDef.modelName,
        prompt: cpState.prompt,
        size: cpState.size !== 'auto' ? cpState.size : undefined,
        aspectRatio: cpState.ar || '1:1',
        resolution: cpState.res || '1k',
        image: imageParam,
      }, onProgress)

      cpState.progress = 100
      addResult({ url: result.url, type: 'image', model: modelDef.label, task: cpState.task, ts: Date.now() })

    } else if (mediaType === 'video') {
      // 视频生成 — 使用 V5 的 generateVideo
      const imageUrl = cpState.task === 'image-video' && cpState.files.length > 0
        ? await fileToDataUrl(cpState.files[0])
        : undefined

      const result = await generateVideo({
        model: modelDef.modelName,
        prompt: cpState.prompt,
        aspectRatio: cpState.ar || '16:9',
        resolution: cpState.res,
        duration: cpState.dur,
        imageUrl,
      }, onProgress)

      cpState.progress = 100
      addResult({ url: result.url, type: 'video', model: modelDef.label, task: cpState.task, ts: Date.now() })

    } else if (mediaType === 'audio') {
      // 音乐生成 — 使用 V5 的 generateAudio
      const result = await generateAudio(cpState.prompt)
      cpState.progress = 100
      addResult({ url: result.url, type: 'audio', model: modelDef.label, task: 'text-music', ts: Date.now() })
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

// ─── 工具 ───
async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(f)
  })
}
