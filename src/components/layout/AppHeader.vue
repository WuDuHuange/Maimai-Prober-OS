<template>
  <header class="app-header">
    <div class="flex items-center justify-between px-4 h-full">
      <div class="flex items-center gap-3">
        <span class="text-lg font-bold tracking-wider text-text-primary select-none">
          Maimai-Prober-OS
        </span>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--bg-hover);
  flex-shrink: 0;
}
</style>
