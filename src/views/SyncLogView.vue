<template>
  <div class="sync-log-view p-4 overflow-y-auto h-full">
    <h1 class="text-lg font-bold text-text-primary mb-4">同步日志</h1>

    <div v-if="logs.length === 0" class="text-text-muted text-sm text-center py-8">暂无同步记录</div>

    <div v-for="log in logs" :key="log.id" class="log-item" :class="log.status">
      <div class="flex items-center justify-between">
        <span class="text-xs" :class="statusClass(log.status)">{{ statusLabel(log.status) }}</span>
        <span class="text-xs text-text-muted">{{ formatTime(log.startedAt) }}</span>
      </div>
      <div class="text-xs text-text-secondary mt-1">
        {{ log.syncType === 'full' ? '全量同步' : '增量同步' }}
        - 新增 {{ log.newRecords }} / 总计 {{ log.totalRecords }} 条
      </div>
      <div v-if="log.errorMessage" class="text-xs text-danger mt-1">{{ log.errorMessage }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db } from '@/services/db';
import type { SyncLog } from '@/types/sync';

const logs = ref<SyncLog[]>([]);

onMounted(async () => {
  logs.value = await db.syncLogs
    .orderBy('startedAt')
    .reverse()
    .limit(50)
    .toArray();
});

function statusClass(s: string): string {
  return s === 'success' ? 'text-success' : s === 'failed' ? 'text-danger' : 'text-warning';
}

function statusLabel(s: string): string {
  return s === 'success' ? '成功' : s === 'failed' ? '失败' : '部分成功';
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}
</script>

<style scoped>
.log-item {
  background-color: var(--bg-secondary);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid transparent;
}

.log-item.success { border-left-color: var(--color-success); }
.log-item.failed { border-left-color: var(--color-danger); }
.log-item.partial { border-left-color: var(--color-warning); }
</style>
