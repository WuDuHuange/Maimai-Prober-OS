import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { B50Record } from '@/types/b50';
import { db } from '@/services/db';
import { getConstByDifficulty } from '@/types/song';

/** 谱面唯一键：同一首歌的同一难度只应占用一个 B50 名额 */
function chartKey(r: Pick<B50Record, 'songId' | 'difficulty'>): string {
  return `${r.songId}_${r.difficulty}`;
}

export const useB50Store = defineStore('b50', () => {
  const b50List = ref<B50Record[]>([]);
  /** 理论值 = B15 贡献合计 + B35 贡献合计（diving-fish 单曲 ra 之和，即官方 Rating 口径） */
  const computedRating = ref(0);
  const b15List = computed(() => b50List.value.filter(b => b.isNew).slice(0, 15));
  const b35List = computed(() => b50List.value.filter(b => !b.isNew).slice(0, 35));
  const b15Total = computed(() => sumContribution(b15List.value));
  const b35Total = computed(() => sumContribution(b35List.value));

  async function loadFromDB() {
    const snapshot = await db.b50Snapshot
      .orderBy('ratingContribution')
      .reverse()
      .toArray();

    // 兜底去重：历史快照可能残留同一谱面的多条记录（旧版重建逻辑未归并）。
    // 每个谱面保留贡献最高的一条，保证前端渲染与统计都不会重复计数。
    const bestByChart = new Map<string, B50Record>();
    for (const record of snapshot) {
      const key = chartKey(record);
      const prev = bestByChart.get(key);
      if (!prev || (record.ratingContribution ?? 0) > (prev.ratingContribution ?? 0)) {
        bestByChart.set(key, record);
      }
    }

    const deduped = [...bestByChart.values()]
      .sort((a, b) => (b.ratingContribution ?? 0) - (a.ratingContribution ?? 0));

    const songIds = [...new Set(deduped.map(b => b.songId))];
    const songs = await db.songs.bulkGet(songIds);
    const songMap = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));

    b50List.value = deduped.map(b => {
      const song = songMap.get(b.songId);
      return {
        ...b,
        title: song?.title,
        artist: song?.artist,
        constant: song ? getConstByDifficulty(song, b.difficulty) ?? undefined : undefined,
        // 从歌曲表补充 isNew/type（旧快照可能没有这些字段）
        isNew: b.isNew ?? song?.isNew ?? false,
        type: b.type ?? song?.type ?? 'SD',
      };
    });

    computedRating.value = sumContribution(b50List.value);
  }

  return {
    b50List, computedRating,
    b15List, b35List, b15Total, b35Total,
    loadFromDB,
  };
});

function sumContribution(list: B50Record[]): number {
  return list.reduce((sum, item) => sum + (item.ratingContribution ?? 0), 0);
}
