<template>
  <footer class="app-statusbar">
    <div class="flex items-center justify-between px-3 h-full text-xs text-text-muted">
      <div class="flex items-center gap-4">
        <span>状态: {{ statusText }}</span>
        <span v-if="totalRecords > 0">本地战绩: {{ totalRecords }} 条</span>
      </div>
      <div class="flex items-center gap-4">
        <span v-if="lastSync">上次同步: {{ lastSync }}</span>
        <span v-if="rating > 0">Rating: {{ rating }}</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSyncStore } from '@/stores/useSyncStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { usePlayerStore } from '@/stores/usePlayerStore';

const syncStore = useSyncStore();
const playLogStore = usePlayLogStore();
const playerStore = usePlayerStore();

const statusText = computed(() => {
  switch (syncStore.status) {
    case 'syncing': return '同步中...';
    case 'completed': return '同步完成';
    case 'error': return '同步失败';
    default: return '就绪';
  }
});

const totalRecords = computed(() => playLogStore.totalCount);
const rating = computed(() => playerStore.currentRating);

const lastSync = computed(() => {
  const t = playLogStore.lastSyncTime;
  if (!t) return null;
  return new Date(t).toLocaleString('zh-CN');
});
</script>

<style scoped>
.app-statusbar {
  height: var(--statusbar-height);
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--bg-hover);
  flex-shrink: 0;
}
</style>
