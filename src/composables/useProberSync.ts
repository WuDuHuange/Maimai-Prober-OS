import { fullSync } from '@/services/syncEngine';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import { usePlayerStore } from '@/stores/usePlayerStore';

export function useProberSync() {
  const syncStore = useSyncStore();
  const songStore = useSongStore();
  const playLogStore = usePlayLogStore();
  const b50Store = useB50Store();
  const playerStore = usePlayerStore();

  async function startSync(token: string) {
    syncStore.startSync();
    console.log('[Sync] 开始同步, Import-Token 长度:', token.length);

    try {
      const result = await fullSync(token, (progress) => {
        syncStore.updateProgress(progress);
      });

      console.log('[Sync] 完成 - 新增:', result.newCount, '总计:', result.totalCount, '玩家:', result.playerName, 'Rating:', result.playerRating);
      syncStore.completeSync(result);

      // Update player info from sync result
      playerStore.setProfile({
        nickname: result.playerName,
        rating: result.playerRating,
        additionalRating: 0,
        plate: '',
        courseRank: 0,
        classRank: 0,
        trophy: { title: '', color: '' },
      });

      await songStore.loadFromDB();
      await playLogStore.loadFromDB();
      await b50Store.loadFromDB();
    } catch (err: any) {
      console.error('[Sync] 失败:', err?.message || err);
      syncStore.failSync(err?.message ?? String(err));
    }
  }

  return { startSync };
}
