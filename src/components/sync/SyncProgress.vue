<template>
  <div v-if="visible" class="sync-progress">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-text-secondary">{{ progress.message }}</span>
      <span class="text-xs text-text-muted">{{ progress.current }}/{{ progress.total }}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: percentage + '%' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SyncProgress } from '@/types/sync';

const props = defineProps<{
  progress: SyncProgress;
  visible: boolean;
}>();

const percentage = computed(() => {
  if (props.progress.total === 0) return 0;
  return Math.round((props.progress.current / props.progress.total) * 100);
});
</script>

<style scoped>
.sync-progress {
  padding: 8px 12px;
  background-color: var(--bg-card);
  border-radius: 8px;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background-color: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--color-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
</style>
