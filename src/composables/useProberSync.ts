import { fullSync } from '@/services/syncEngine';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useB50HistoryStore } from '@/stores/useB50HistoryStore';

export function useProberSync() {
  const syncStore = useSyncStore();
  const songStore = useSongStore();
  const playLogStore = usePlayLogStore();
  const b50Store = useB50Store();
  const playerStore = usePlayerStore();
  const historyStore = useB50HistoryStore();

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
      // 持久化玩家名，供下次启动恢复
      localStorage.setItem('last_player_name', result.playerName);

      await songStore.loadFromDB();
      await playLogStore.loadFromDB();
      await b50Store.loadFromDB();

      // 同步后自动留档：内容与上一份完全一致时不会重复存（service 内部按指纹去重）。
      // ⚠️ 不能让它影响同步结果 —— 历史快照是附加功能，失败只记日志。
      try {
        // 接口没给 rating 时用 B50 理论值兜底，避免快照里出现 0
        const rating = result.playerRating || b50Store.computedRating;
        await historyStore.capture(b50Store.b50List, rating, 'sync');
      } catch (e) {
        console.warn('[B50History] 快照保存失败（不影响同步）:', e);
      }
    } catch (err: any) {
      console.error('[Sync] 失败:', err?.message || err);
      syncStore.failSync(err?.message ?? String(err));
    }
  }

  return { startSync };
}
