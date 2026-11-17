/**
 * B50 历史快照 Store —— 只负责把 service 的读写结果同步到响应式状态。
 * 算法与去重逻辑都在 `services/b50HistoryService.ts`。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AbilitySnapshot, B50HistoryEntry, B50HistorySource } from '@/types/b50History';
import type { B50Record } from '@/types/b50';
import {
  attachAbilitySnapshot,
  captureB50Snapshot,
  deleteB50History,
  listB50History,
} from '@/services/b50HistoryService';

export const useB50HistoryStore = defineStore('b50History', () => {
  const entries = ref<B50HistoryEntry[]>([]);
  const isLoading = ref(false);
  /** 上一次 capture 是否因为「内容没变」被跳过 —— 用于给用户反馈 */
  const lastSkipped = ref(false);

  const latest = computed<B50HistoryEntry | null>(() =>
    entries.value.length > 0 ? entries.value[entries.value.length - 1] : null,
  );
  const hasComparison = computed(() => entries.value.length >= 2);

  async function load(): Promise<void> {
    isLoading.value = true;
    try {
      entries.value = await listB50History();
    } finally {
      isLoading.value = false;
    }
  }

  async function capture(
    records: B50Record[],
    rating: number,
    source: B50HistorySource = 'manual',
  ): Promise<B50HistoryEntry | null> {
    lastSkipped.value = false;
    const entry = await captureB50Snapshot(records, rating, source);
    if (!entry) lastSkipped.value = true;
    await load();
    return entry;
  }

  async function attach(fingerprint: string, ability: AbilitySnapshot): Promise<boolean> {
    const ok = await attachAbilitySnapshot(fingerprint, ability);
    if (ok) await load();
    return ok;
  }

  async function remove(id: number): Promise<void> {
    await deleteB50History(id);
    await load();
  }

  return { entries, isLoading, lastSkipped, latest, hasComparison, load, capture, attach, remove };
});
