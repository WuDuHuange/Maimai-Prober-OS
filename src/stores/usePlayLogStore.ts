import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PlayRecord, RatingPoint } from '@/types/playRecord';
import { db } from '@/services/db';

export const usePlayLogStore = defineStore('playLog', () => {
  const records = ref<PlayRecord[]>([]);
  const totalCount = ref(0);
  const lastSyncTime = ref<string | null>(localStorage.getItem('last_sync_time'));

  async function loadFromDB() {
    const all = await db.playLogs.toArray();
    records.value = all;
    totalCount.value = all.length;
  }

  async function getSongHistory(songId: number, difficulty: string): Promise<PlayRecord[]> {
    return db.playLogs
      .where('songId')
      .equals(songId)
      .filter(r => r.difficulty === difficulty)
      .sortBy('playTime');
  }

  async function getRatingTrend(days = 90): Promise<RatingPoint[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const all = await db.playLogs.toArray();
    const dailyMap = new Map<string, number>();

    for (const r of all) {
      if (r.playTime < cutoff.toISOString()) continue;
      if (r.ratingAfter == null) continue;
      const dateKey = r.playTime.slice(0, 10);
      const current = dailyMap.get(dateKey) ?? 0;
      if (r.ratingAfter > current) {
        dailyMap.set(dateKey, r.ratingAfter);
      }
    }

    return Array.from(dailyMap.entries())
      .map(([playDate, rating]) => ({ playDate, rating }))
      .sort((a, b) => a.playDate.localeCompare(b.playDate));
  }

  async function getRecentFails(limit = 20): Promise<PlayRecord[]> {
    const all = await db.playLogs.orderBy('playTime').reverse().toArray();
    return all
      .filter(r => (r.difficulty === 'master' || r.difficulty === 'remaster') && r.achievements < 97.0)
      .slice(0, limit);
  }

  /** 获取最近的游玩记录（不限难度） */
  async function getRecentPlays(limit = 50): Promise<PlayRecord[]> {
    return db.playLogs.orderBy('playTime').reverse().limit(limit).toArray();
  }

  return {
    records, totalCount, lastSyncTime,
    loadFromDB, getSongHistory, getRatingTrend, getRecentFails, getRecentPlays,
  };
});
