<script setup lang="ts">
/**
 * FileUploader.vue — 文件上传器（点击 + 拖拽 + 粘贴）
 *
 * 移植自 V4 code.html:
 *   - handleFileSelect 行 10713
 *   - handleDrop/handleDragOver 行 10730+
 *   - handlePaste 行 10747
 *   - addAttachedFile / renderAttachedFiles
 */
import { ref, computed } from 'vue'

export interface AttachedFile {
  file: File
  preview?: string  // base64 预览（图片用）
  textContent?: string  // 文本文件内容
}

const attachedFiles = ref<AttachedFile[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

// 暴露给父组件
defineExpose({ attachedFiles, clearAll })

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (let i = 0; i < input.files.length; i++) {
    addFile(input.files[i])
  }
  input.value = '' // reset
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

  const entry: AttachedFile = { file }

  // 图片预览
  if (file.type.startsWith('image/')) {
    entry.preview = await readAsDataURL(file)
  }
  // 文本文件读取内容
  if (file.type.startsWith('text/') || /\.(txt|md|csv|json|xml|html|css|js|ts|py|java|c|cpp|go|rs|sh)$/i.test(file.name)) {
    entry.textContent = await readAsText(file)
  }

  attachedFiles.value.push(entry)
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve('')
    reader.readAsText(file)
  })
}

function removeFile(index: number) {
  attachedFiles.value.splice(index, 1)
}

function clearAll() {
  attachedFiles.value = []
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function getIcon(name: string, type: string) {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'movie'
  if (type.startsWith('audio/')) return 'graphic_eq'
  if (/\.pdf$/i.test(name)) return 'picture_as_pdf'
  if (/\.(doc|docx)$/i.test(name)) return 'description'
  if (/\.(xls|xlsx|csv)$/i.test(name)) return 'table_chart'
  if (/\.(ppt|pptx)$/i.test(name)) return 'slideshow'
  return 'attach_file'
}

const hasFiles = computed(() => attachedFiles.value.length > 0)
</script>

<template>
  <!-- 隐藏的 input -->
  <input
    ref="fileInput"
    type="file"
    multiple
    style="display:none"
    @change="handleFileSelect"
  />

  <!-- 附件预览条 -->
  <div v-if="hasFiles" class="attach-bar">
    <div v-for="(af, i) in attachedFiles" :key="i" class="attach-chip">
      <img v-if="af.preview" :src="af.preview" class="attach-thumb" />
      <span v-else class="mso attach-icon">{{ getIcon(af.file.name, af.file.type) }}</span>
      <span class="attach-name">{{ af.file.name }}</span>
      <span class="attach-size">({{ formatSize(af.file.size) }})</span>
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
  max-width: 220px;
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
.attach-rm {
  font-size: 14px; color: var(--ink3); cursor: pointer;
  margin-left: 2px; flex-shrink: 0;
}
.attach-rm:hover { color: #e53935; }
</style>
