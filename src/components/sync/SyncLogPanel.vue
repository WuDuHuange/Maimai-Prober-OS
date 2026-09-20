<template>
  <div class="sync-log-panel">
    <button class="log-toggle" :class="{ open }" @click="open = !open">
      <span class="toggle-caret">›</span>
      <span class="toggle-text">同步日志</span>
      <span class="toggle-meta">{{ logs.length }} 条{{ failedCount ? ` · ${failedCount} 次失败` : '' }}</span>
    </button>

    <div v-if="open" class="log-body">
      <p v-if="loading" class="log-empty">加载中…</p>
      <p v-else-if="logs.length === 0" class="log-empty">暂无同步记录</p>

      <div v-else class="log-list">
        <div
          v-for="(log, i) in logs"
          :key="log.id ?? i"
          class="log-item"
          :class="log.status"
          :style="{ '--d': i }"
        >
          <div class="log-head">
            <span class="log-status" :class="log.status">{{ statusLabel(log.status) }}</span>
            <span class="log-time">{{ formatTime(log.startedAt) }}</span>
          </div>
          <div class="log-meta">
            {{ log.syncType === 'full' ? '全量同步' : '增量同步' }}
            · 新增 {{ log.newRecords }} / 总计 {{ log.totalRecords }} 条
          </div>
          <div v-if="log.errorMessage" class="log-error">{{ log.errorMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db } from '@/services/db';
import type { SyncLog } from '@/types/sync';

const logs = ref<SyncLog[]>([]);
const loading = ref(true);
const open = ref(false);

const failedCount = computed(() => logs.value.filter(l => l.status === 'failed').length);

onMounted(async () => {
  try {
    logs.value = await db.syncLogs.orderBy('startedAt').reverse().limit(50).toArray();
  } catch {
    logs.value = [];
  } finally {
    loading.value = false;
  }
});

function statusLabel(s: string): string {
  return s === 'success' ? '成功' : s === 'failed' ? '失败' : '部分成功';
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}
</script>

<style scoped>
.sync-log-panel { display: flex; flex-direction: column; }

.log-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-body);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.log-toggle:hover { background: var(--bg-hover); border-color: rgba(74, 114, 255, 0.25); }

.toggle-caret {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-muted);
  transition: transform var(--transition-smooth);
  display: inline-block;
  line-height: 1;
}
.log-toggle.open .toggle-caret { transform: rotate(90deg); }

.toggle-text { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.toggle-meta { margin-left: auto; font-size: 10px; color: var(--text-muted); }

.log-body { margin-top: 10px; }
.log-empty { font-size: 11px; color: var(--text-muted); padding: 12px 0; text-align: center; }

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 2px;
}

.log-item {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-body);
  border-left: 3px solid var(--border-color);
  animation: log-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 35ms);
}
.log-item.success { border-left-color: var(--color-success); }
.log-item.failed { border-left-color: var(--color-danger); }
.log-item.partial { border-left-color: var(--color-warning); }

@keyframes log-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}

.log-head { display: flex; align-items: center; justify-content: space-between; }
.log-status { font-size: 11px; font-weight: 700; }
.log-status.success { color: var(--color-success); }
.log-status.failed { color: var(--color-danger); }
.log-status.partial { color: var(--color-warning); }
.log-time { font-size: 10px; color: var(--text-muted); }

.log-meta { font-size: 11px; color: var(--text-secondary); margin-top: 3px; }
.log-error { font-size: 10px; color: var(--color-danger); margin-top: 4px; line-height: 1.5; }

@media (prefers-reduced-motion: reduce) {
  .log-item { animation: none; }
  .toggle-caret { transition: none; }
}
</style>
