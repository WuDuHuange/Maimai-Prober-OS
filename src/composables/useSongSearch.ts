import { ref } from 'vue';
import { db } from '@/services/db';
import type { SongMeta } from '@/types/song';

export function useSongSearch() {
  const query = ref('');
  const results = ref<SongMeta[]>([]);
  const isSearching = ref(false);

  async function search(q: string) {
    query.value = q;
    if (!q.trim()) {
      results.value = [];
      return;
    }

    isSearching.value = true;
    try {
      const all = await db.songs.toArray();
      const lower = q.toLowerCase();
      results.value = all.filter(
        s =>
          s.title.toLowerCase().includes(lower) ||
          s.artist.toLowerCase().includes(lower)
      ).slice(0, 30);
    } finally {
      isSearching.value = false;
    }
  }

  function clear() {
    query.value = '';
    results.value = [];
  }

  return { query, results, isSearching, search, clear };
}
