<script setup lang="ts">
/**
 * CanvasFrame — 画布容器
 * 
 * 当前阶段：显示占位符，等画布 HTML 准备好后切换为 iframe 嵌入
 * 生产阶段：iframe src 指向你原有的创作面板
 */
import { ref } from 'vue'

// 画布是否已准备好（后续切换为 iframe 模式）
const canvasReady = ref(false)
</script>

<template>
  <div class="canvas-frame">
    <!-- 占位模式 — 画布尚未嵌入 -->
    <div v-if="!canvasReady" class="canvas-placeholder">
      <span class="mso canvas-icon">palette</span>
      <h3 class="serif">创作画布</h3>
      <p>画布将在此区域显示</p>
      <p class="canvas-hint">文生图 · 图生图 · 生视频 · 画廊</p>
    </div>

    <!-- iframe 模式 — 后续启用 -->
    <!-- <iframe v-else src="/canvas/index.html" class="canvas-iframe" frameborder="0" /> -->
  </div>
</template>

<style scoped>
.canvas-frame {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
}
.canvas-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--ink3);
  text-align: center;
  padding: 24px;
}
.canvas-icon {
  font-size: 48px;
  color: var(--olive-dark);
  animation: gc-float 3s ease-in-out infinite;
}
.canvas-placeholder h3 {
  font-size: 20px;
  color: var(--ink);
  margin-top: 4px;
}
.canvas-placeholder p {
  font-size: 13px;
  line-height: 1.6;
}
.canvas-hint {
  margin-top: 8px;
  padding: 6px 14px;
  background: var(--olive-pale);
  border-radius: 999px;
  font-size: 12px;
  color: var(--olive-dark);
  font-weight: 600;
}
@keyframes gc-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
</style>
