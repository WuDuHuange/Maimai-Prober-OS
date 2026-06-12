import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { B50Record } from '@/types/b50';
import { db } from '@/services/db';
import { getConstByDifficulty } from '@/types/song';

export const useB50Store = defineStore('b50', () => {
  const b50List = ref<B50Record[]>([]);
  const computedRating = ref(0);

  async function loadFromDB() {
    const b50 = await db.b50Snapshot
      .orderBy('ratingContribution')
      .reverse()
      .toArray();

    const songIds = [...new Set(b50.map(b => b.songId))];
    const songs = await db.songs.bulkGet(songIds);
    const songMap = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));

    b50List.value = b50.map(b => {
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

    computedRating.value = b50.reduce((sum, b) => sum + (b.ratingContribution ?? 0), 0);
  }

  return { b50List, computedRating, loadFromDB };
});
