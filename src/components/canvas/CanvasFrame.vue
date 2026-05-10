<script setup lang="ts">
/**
 * CanvasFrame — 画布 iframe 嵌入容器
 * 
 * 把你原有的创作面板(#rh-creation-panel)通过 iframe 原封不动嵌入。
 * 用 postMessage 桥接通信。
 * 
 * 这个组件的原则：画布代码 0 修改，所有通信通过 useCanvasBridge 处理。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const iframeRef = ref<HTMLIFrameElement | null>(null)
const isLoaded = ref(false)

// Canvas source — 指向你原有的画布 HTML
// 在开发时指向本地文件，生产时指向子路径
const canvasSrc = '/canvas/index.html'

function onIframeLoad() {
  isLoaded.value = true
}

// postMessage bridge
function handleMessage(event: MessageEvent) {
  // TODO: 处理画布发来的消息（创作完成、状态更新等）
  if (event.data?.source === 'jiucaihezi-canvas') {
    console.log('[CanvasBridge] Received:', event.data)
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
})

// 向画布发送消息
function postToCanvas(type: string, payload: any = {}) {
  iframeRef.value?.contentWindow?.postMessage(
    { source: 'jiucaihezi-app', type, ...payload },
    '*'
  )
}

defineExpose({ postToCanvas })
</script>

<template>
  <div class="canvas-frame">
    <!-- Loading placeholder -->
    <div v-if="!isLoaded" class="canvas-loading">
      <span class="mso" style="font-size: 36px; color: var(--ink3); animation: gc-float 3s ease-in-out infinite;">palette</span>
      <span class="canvas-loading-label">正在加载创作面板...</span>
    </div>

    <!-- The actual canvas iframe -->
    <iframe
      ref="iframeRef"
      :src="canvasSrc"
      class="canvas-iframe"
      :class="{ loaded: isLoaded }"
      frameborder="0"
      allow="clipboard-write; clipboard-read"
      @load="onIframeLoad"
    />
  </div>
</template>

<style scoped>
.canvas-frame {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
}
.canvas-iframe {
  width: 100%;
  height: 100%;
  border: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.canvas-iframe.loaded {
  opacity: 1;
}
.canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ink3);
}
.canvas-loading-label {
  font-size: 13px;
}
@keyframes gc-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
</style>
