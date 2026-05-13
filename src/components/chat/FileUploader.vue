<script setup lang="ts">
/**
 * FileUploader.vue — 文件上传器（点击 + 拖拽 + 粘贴）
 * 支持：图片（自动压缩）、文本/代码、PDF（文本提取）
 */
import { ref, computed } from 'vue'
import {
  validateFile, isImageFile, isTextFile, isPdfFile,
  compressImage, extractPdfText, readFileAsText,
  truncateText, formatSize, TEXT_TRUNCATE_BYTES
} from '@/utils/fileProcessor'

export interface AttachedFile {
  file: File
  preview?: string
  textContent?: string
  status: 'processing' | 'ready' | 'error'
  error?: string
}

const attachedFiles = ref<AttachedFile[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const isProcessing = computed(() => attachedFiles.value.some(f => f.status === 'processing'))
const hasFiles = computed(() => attachedFiles.value.length > 0)
const readyFiles = computed(() => attachedFiles.value.filter(f => f.status === 'ready'))

defineExpose({
  attachedFiles: readyFiles,
  isProcessing,
  clearAll,
  triggerFileInput,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handlePaste,
})

function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 4000)
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (let i = 0; i < input.files.length; i++) {
    addFile(input.files[i])
  }
  input.value = ''
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  for (let i = 0; i < files.length; i++) {
    addFile(files[i])
  }
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const blob = items[i].getAsFile()
      if (blob) {
        const name = `粘贴图片_${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.png`
        const f = new File([blob], name, { type: blob.type })
        addFile(f)
      }
    }
  }
}

async function addFile(file: File) {
  // 去重
  if (attachedFiles.value.some(f => f.file.name === file.name && f.file.size === file.size)) return

  // 校验
  const validation = validateFile(file)
  if (!validation.ok) {
    showToast(validation.error!)
    return
  }

  const entry: AttachedFile = { file, status: 'processing' }
  attachedFiles.value.push(entry)

  try {
    if (isImageFile(file)) {
      entry.preview = await compressImage(file)
      entry.status = 'ready'
    } else if (isPdfFile(file)) {
      entry.textContent = await extractPdfText(file)
      entry.status = 'ready'
    } else if (isTextFile(file)) {
      let text = await readFileAsText(file)
      const { text: truncated, truncated: wasTruncated } = truncateText(text, TEXT_TRUNCATE_BYTES)
      if (wasTruncated) {
        showToast(`${file.name} 内容过大，已截取前 500KB`)
        text = truncated
      }
      entry.textContent = text
      entry.status = 'ready'
    } else {
      entry.status = 'error'
      entry.error = '暂不支持这个文件格式'
      showToast(entry.error)
    }
  } catch (err: any) {
    entry.status = 'error'
    entry.error = err.message || '文件处理失败'
    showToast(entry.error!)
  }
}

function removeFile(index: number) {
  attachedFiles.value.splice(index, 1)
}

function clearAll() {
  attachedFiles.value = []
}

function getIcon(name: string, type: string) {
  if (type.startsWith('image/')) return 'image'
  if (/\.pdf$/i.test(name)) return 'picture_as_pdf'
  if (/\.(doc|docx)$/i.test(name)) return 'description'
  if (/\.(xls|xlsx|csv)$/i.test(name)) return 'table_chart'
  if (/\.(py|js|ts|java|go|rs|c|cpp|rb|php|swift|kt)$/i.test(name)) return 'code'
  if (/\.(json|yaml|yml|toml|xml|ini|conf)$/i.test(name)) return 'data_object'
  if (/\.(md|txt|log)$/i.test(name)) return 'article'
  return 'attach_file'
}
</script>

<template>
  <input
    ref="fileInput"
    type="file"
    multiple
    style="display:none"
    @change="handleFileSelect"
  />

  <!-- Toast 提示 -->
  <Transition name="toast">
    <div v-if="toastMsg" class="upload-toast">{{ toastMsg }}</div>
  </Transition>

  <!-- 附件预览条 -->
  <div v-if="hasFiles" class="attach-bar">
    <div v-for="(af, i) in attachedFiles" :key="i" class="attach-chip" :class="{ 'is-error': af.status === 'error' }">
      <!-- 处理中 spinner -->
      <span v-if="af.status === 'processing'" class="attach-spinner"></span>
      <!-- 图片缩略图 -->
      <img v-else-if="af.preview" :src="af.preview" class="attach-thumb" />
      <!-- 文件图标 -->
      <span v-else class="mso attach-icon">{{ getIcon(af.file.name, af.file.type) }}</span>

      <span class="attach-name">{{ af.file.name }}</span>
      <span class="attach-size">({{ formatSize(af.file.size) }})</span>
      <span v-if="af.status === 'error'" class="attach-err" :title="af.error">!</span>
      <span class="mso attach-rm" @click="removeFile(i)">close</span>
    </div>
  </div>
</template>

<style scoped>
.attach-bar {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 6px 12px; border-top: 1px solid var(--line);
  background: var(--surface);
}
.attach-chip {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px;
  background: var(--paper); border: 1px solid var(--line);
  font-size: 12px; color: var(--ink2);
  max-width: 240px; transition: border-color 0.2s;
}
.attach-chip.is-error {
  border-color: #e53935; background: rgba(229,57,53,0.05);
}
.attach-thumb {
  width: 24px; height: 24px; border-radius: 4px;
  object-fit: cover; flex-shrink: 0;
}
.attach-icon { font-size: 16px; color: var(--olive); flex-shrink: 0; }
.attach-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 120px; font-weight: 500;
}
.attach-size { color: var(--ink3); font-size: 11px; flex-shrink: 0; }
.attach-err {
  width: 16px; height: 16px; border-radius: 50%;
  background: #e53935; color: #fff; font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; flex-shrink: 0; cursor: help;
}
.attach-rm {
  font-size: 14px; color: var(--ink3); cursor: pointer;
  margin-left: 2px; flex-shrink: 0;
}
.attach-rm:hover { color: #e53935; }

.attach-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid var(--line); border-top-color: var(--olive);
  animation: spin 0.8s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.upload-toast {
  position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
  background: rgba(30,30,30,0.92); color: #fff;
  padding: 8px 18px; border-radius: 8px; font-size: 13px;
  z-index: 9999; pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>
