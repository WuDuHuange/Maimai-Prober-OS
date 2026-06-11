<template>
  <aside class="right-sidebar">
    <slot />
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
