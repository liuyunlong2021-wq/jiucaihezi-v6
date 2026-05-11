<script setup lang="ts">
/**
 * ChatScrollNav.vue — 滚动导航 + 自由滚动
 *
 * 移植自 V4 code.html:
 *   - updateChatScrollControls 行 7845
 *   - scrollChatToTop / scrollChatToBottom 行 7896/7906
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  container: HTMLElement | null
  isStreaming: boolean
}>()

const showTop = ref(false)
const showBottom = ref(false)
const userScrolled = ref(false) // 用户手动滚动时暂停自动滚底

function update() {
  const el = props.container
  if (!el) return
  const overflow = el.scrollHeight > el.clientHeight + 24
  showTop.value = overflow && el.scrollTop > 28
  showBottom.value = overflow && (el.scrollTop + el.clientHeight < el.scrollHeight - 28)
}

function scrollToTop() {
  props.container?.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  const el = props.container
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    userScrolled.value = false
  }
}

// 检测用户手动滚动（非程序触发）
let scrollTimer: ReturnType<typeof setTimeout> | null = null
function onScroll() {
  update()
  // 如果正在流式输出，且用户不在底部 → 标记为用户手动滚动
  if (props.isStreaming) {
    const el = props.container
    if (el) {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
      if (!atBottom) {
        userScrolled.value = true
      } else {
        userScrolled.value = false
      }
    }
  }
}

// 流式输出时智能滚底：仅在用户没有手动滚动时自动滚底
watch(() => props.isStreaming, (streaming) => {
  if (!streaming) {
    userScrolled.value = false
  }
})

// 暴露自动滚底方法给父组件
function autoScrollIfNeeded() {
  if (!userScrolled.value && props.container) {
    props.container.scrollTop = props.container.scrollHeight
  }
}

defineExpose({ autoScrollIfNeeded, userScrolled, scrollToBottom })

onMounted(() => {
  props.container?.addEventListener('scroll', onScroll, { passive: true })
  update()
})

onBeforeUnmount(() => {
  props.container?.removeEventListener('scroll', onScroll)
})

// 当 container 变化时重新绑定
watch(() => props.container, (newEl, oldEl) => {
  oldEl?.removeEventListener('scroll', onScroll)
  newEl?.addEventListener('scroll', onScroll, { passive: true })
  update()
})
</script>

<template>
  <div v-if="showTop || showBottom" class="scroll-nav">
    <button v-if="showTop" class="scroll-btn" @click="scrollToTop" title="滚动到顶部">
      <span class="mso">keyboard_arrow_up</span>
    </button>
    <button v-if="showBottom" class="scroll-btn" @click="scrollToBottom" title="滚动到底部">
      <span class="mso">keyboard_arrow_down</span>
    </button>
  </div>
</template>

<style scoped>
.scroll-nav {
  position: sticky; bottom: 4px;
  display: flex; flex-direction: column; gap: 4px;
  z-index: 10; align-self: flex-end;
  margin-top: -70px; margin-right: 4px;
  pointer-events: none;
  animation: fade-in .2s ease;
}
.scroll-nav > * { pointer-events: auto; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.scroll-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--paper); color: var(--ink2);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .12s;
  box-shadow: 0 2px 6px rgba(0,0,0,.08);
}
.scroll-btn:hover {
  background: var(--olive); color: #fff; border-color: var(--olive);
}
.scroll-btn .mso { font-size: 20px; }
</style>
