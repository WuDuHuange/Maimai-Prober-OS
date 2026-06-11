import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SongMeta } from '@/types/song';
import { db } from '@/services/db';

export const useSongStore = defineStore('song', () => {
  const songs = ref<Map<number, SongMeta>>(new Map());
  const isLoading = ref(false);

  async function loadFromDB() {
    isLoading.value = true;
    try {
      const all = await db.songs.toArray();
      const map = new Map<number, SongMeta>();
      all.forEach(s => map.set(s.songId, s));
      songs.value = map;
    } finally {
      isLoading.value = false;
    }
  }

  function getSong(id: number): SongMeta | undefined {
    return songs.value.get(id);
  }

  async function search(query: string): Promise<SongMeta[]> {
    const all = await db.songs.toArray();
    const q = query.toLowerCase();
    return all.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q)
    );
  }

  return { songs, isLoading, loadFromDB, getSong, search };
});
