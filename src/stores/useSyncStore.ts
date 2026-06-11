import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SyncResult, SyncProgress } from '@/types/sync';

export const useSyncStore = defineStore('sync', () => {
  const status = ref<'idle' | 'syncing' | 'completed' | 'error'>('idle');
  const progress = ref<SyncProgress>({ current: 0, total: 0, message: '' });
  const lastSyncResult = ref<SyncResult | null>(null);
  const errorMessage = ref<string | null>(null);

  function startSync() {
    status.value = 'syncing';
    progress.value = { current: 0, total: 0, message: '准备同步...' };
    errorMessage.value = null;
  }

  function updateProgress(p: SyncProgress) {
    progress.value = p;
  }

  function completeSync(result: SyncResult) {
    status.value = 'completed';
    lastSyncResult.value = result;
    localStorage.setItem('last_sync_time', result.lastSync);
  }

  function failSync(error: string) {
    status.value = 'error';
    errorMessage.value = error;
  }

  function reset() {
    status.value = 'idle';
    progress.value = { current: 0, total: 0, message: '' };
  }

  return {
    status, progress, lastSyncResult, errorMessage,
    startSync, updateProgress, completeSync, failSync, reset,
  };
});
