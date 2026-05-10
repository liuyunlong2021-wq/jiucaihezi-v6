<script setup lang="ts">
/**
 * FileTreePanel — 全局文件树底座
 * 源自 code.html #folder-col (行 1044-1077)
 * 
 * 文件树是全局的底座，所有内容都在这里：
 * - 搭子列表
 * - 对话记录
 * - 知识库文件
 * - 创作作品
 */
import { ref, computed } from 'vue'

const searchQuery = ref('')

// TODO: 从 agentStore / sessionStore 拉取数据渲染树节点
// 这里先用占位数据展示结构

interface TreeNode {
  id: string
  label: string
  icon: string
  type: 'folder' | 'agent' | 'session' | 'file' | 'creation'
  children?: TreeNode[]
  expanded?: boolean
}

const tree = ref<TreeNode[]>([
  {
    id: 'agents',
    label: '搭子',
    icon: 'smart_toy',
    type: 'folder',
    expanded: true,
    children: []
  },
  {
    id: 'sessions',
    label: '对话记录',
    icon: 'chat_bubble',
    type: 'folder',
    expanded: false,
    children: []
  },
  {
    id: 'knowledge',
    label: '知识库',
    icon: 'psychology',
    type: 'folder',
    expanded: false,
    children: []
  },
  {
    id: 'creations',
    label: '创作作品',
    icon: 'palette',
    type: 'folder',
    expanded: false,
    children: []
  }
])

function toggleFolder(node: TreeNode) {
  if (node.type === 'folder') {
    node.expanded = !node.expanded
  }
}

const emit = defineEmits<{
  (e: 'select', node: TreeNode): void
}>()
</script>

<template>
  <div class="ft">
    <!-- Header -->
    <div class="ft-header">
      <span class="ft-title">文件</span>
      <button class="ft-action" title="新建">
        <span class="mso" style="font-size: 15px;">add</span>
      </button>
    </div>

    <!-- Search -->
    <div class="ft-search">
      <span class="mso" style="font-size: 15px;">search</span>
      <input
        v-model="searchQuery"
        placeholder="搜索..."
        type="text"
      />
    </div>

    <!-- Tree -->
    <div class="ft-tree">
      <div
        v-for="node in tree"
        :key="node.id"
        class="ft-node"
      >
        <!-- Folder header -->
        <div
          class="ft-item"
          :class="{ 'is-folder': node.type === 'folder' }"
          @click="toggleFolder(node)"
        >
          <span
            v-if="node.type === 'folder'"
            class="mso ft-twisty"
            :style="{ transform: node.expanded ? 'rotate(90deg)' : 'rotate(0)' }"
          >chevron_right</span>
          <span class="mso ft-icon">{{ node.icon }}</span>
          <span class="ft-label">{{ node.label }}</span>
          <span v-if="node.children?.length" class="ft-badge">{{ node.children.length }}</span>
        </div>

        <!-- Children -->
        <div v-if="node.expanded && node.children?.length" class="ft-children">
          <div
            v-for="child in node.children"
            :key="child.id"
            class="ft-item ft-child"
            @click="emit('select', child)"
          >
            <span class="mso ft-icon">{{ child.icon }}</span>
            <span class="ft-label">{{ child.label }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="node.expanded && !node.children?.length" class="ft-empty">
          暂无内容
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ft {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-alt);
}
.ft-header {
  padding: 12px 12px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink3);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ft-title { flex: 1; }
.ft-action {
  width: 24px; height: 24px;
  border: none; background: none;
  border-radius: 6px;
  color: var(--ink3);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.ft-action:hover {
  background: var(--olive-pale);
  color: var(--olive-dark);
}
.ft-search {
  padding: 4px 10px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ft-search .mso {
  color: var(--ink3);
  flex-shrink: 0;
}
.ft-search input {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--ink);
  outline: none;
  font-family: inherit;
}
.ft-search input:focus {
  border-color: var(--olive);
}
.ft-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 60px;
}
.ft-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--ink2);
  cursor: pointer;
  transition: all 0.12s;
  border-left: 2px solid transparent;
  user-select: none;
}
.ft-item:hover {
  background: var(--olive-pale);
  color: var(--ink);
}
.ft-item.active {
  background: rgba(213, 199, 135, 0.15);
  color: var(--olive-dark);
  border-left-color: var(--olive);
}
.ft-twisty {
  font-size: 14px !important;
  color: var(--ink3);
  transition: transform 0.15s;
  flex-shrink: 0;
  width: 14px;
}
.ft-icon {
  font-size: 16px;
  flex-shrink: 0;
  color: var(--ink3);
}
.ft-item.active .ft-icon,
.ft-item:hover .ft-icon {
  color: var(--olive);
}
.ft-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ft-badge {
  font-size: 10px;
  color: var(--olive-dark);
  background: rgba(213, 199, 135, 0.12);
  padding: 2px 6px;
  border-radius: 999px;
}
.ft-child {
  padding-left: 36px;
}
.ft-children {
  display: block;
}
.ft-empty {
  padding: 8px 12px 8px 36px;
  font-size: 11px;
  color: var(--ink3);
  font-style: italic;
}
</style>
