<template>
  <aside class="right-sidebar">
    <div class="flex items-center justify-between px-3 py-2 border-b border-bg-hover">
      <span class="text-sm font-semibold text-text-primary">AI 教练</span>
    </div>
    <div class="flex-1 overflow-y-auto">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
</script>

<style scoped>
.right-sidebar {
  width: var(--ai-panel-width);
  height: 100%;
  background-color: var(--bg-secondary);
  border-left: 1px solid var(--bg-hover);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
</style>
