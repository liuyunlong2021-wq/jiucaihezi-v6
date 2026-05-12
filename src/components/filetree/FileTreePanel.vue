<script setup lang="ts">
/**
 * FileTreePanel — 文件树（Col 2）
 * 开发中占位
 */
</script>

<template>
  <div class="ft">
    <div class="ft-placeholder">
      <span class="mso" style="font-size:32px;color:var(--ink3)">folder_open</span>
      <span class="ft-ph-title">文件树</span>
      <span class="ft-ph-hint">开发中</span>
    </div>
  </div>
</template>

<style scoped>
.ft {
  display: flex; flex-direction: column; height: 100%;
  overflow: hidden; background: var(--surface-alt);
}
.ft-placeholder {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
}
.ft-ph-title { font-size: 14px; font-weight: 600; color: var(--ink2); }
.ft-ph-hint { font-size: 11px; color: var(--ink3); }
</style>
