import type { SyncResult, SyncProgress } from '@/types/sync';
import type { PlayRecord } from '@/types/playRecord';
import type { B50Record } from '@/types/b50';
import type { SongMeta, DifficultyType } from '@/types/song';
import { db } from './db';
import { fetchPlayerRecords, fetchSongList, fetchPlayerProfile } from './divingFishApi';
import { mapSongItemToMeta, mapRecordItemToPlayRecord, computeRecordMd5 } from './dataCleaner';

function calculateRatingContribution(constant: number, achievements: number): number {
  const maxRating = constant * 1.15;
  const ratio = achievements / 100;
  if (ratio >= 1.0) return constant * 1.15;
  if (ratio >= 0.97) return maxRating - (100 - achievements) * 0.5;
  if (ratio >= 0.94) return (constant - 3.0) + (achievements - 94) * 0.3;
  if (ratio >= 0.90) return (constant - 5.0) + (achievements - 90) * 0.2;
  return Math.max(0, (constant - 7.0) + (achievements - 80) * 0.1);
}

function getConstForDifficulty(song: SongMeta | undefined, difficulty: DifficultyType): number | null {
  if (!song) return null;
  const map: Record<string, number | null> = {
    basic: song.basicConst,
    advanced: song.advancedConst,
    expert: song.expertConst,
    master: song.masterConst,
    remaster: song.remasterConst,
  };
  return map[difficulty] ?? null;
}

export async function fullSync(
  token: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  let totalRecords = 0;
  let newCount = 0;

  const emit = (current: number, total: number, message: string) => {
    onProgress?.({ current, total, message });
  };

  try {
    // Step 1: Sync song list
    emit(0, 1, '正在获取曲库列表...');
    const songItems = await fetchSongList();
    const songMetas = songItems.map(mapSongItemToMeta);
    await db.songs.bulkPut(songMetas);
    emit(1, 1, `曲库更新完成 (${songMetas.length} 首)`);

    // Step 2: Fetch player profile (validate token)
    emit(0, 2, '正在验证用户信息...');
    await fetchPlayerProfile(token);
    emit(1, 2, '用户已验证');

    // Step 3: Fetch records
    emit(0, 3, '正在拉取战绩列表...');
    const recordItems = await fetchPlayerRecords(token);
    totalRecords = recordItems.length;
    emit(1, 3, `共获取 ${totalRecords} 条记录`);

    // Step 4: Deduplicate and insert new records
    const allExisting = await db.playLogs.toArray();
    const existingMd5s = new Set(allExisting.map(r => r.recordMd5));

    const newRecords: PlayRecord[] = [];
    for (let i = 0; i < recordItems.length; i++) {
      const item = recordItems[i];
      const md5 = computeRecordMd5(item);

      if (!existingMd5s.has(md5)) {
        const record = mapRecordItemToPlayRecord(item);
        record.recordMd5 = md5;
        newRecords.push(record);
      }

      if ((i + 1) % 50 === 0 || i === recordItems.length - 1) {
        emit(i + 1, totalRecords, `正在比对战绩 ${i + 1}/${totalRecords}...`);
      }
    }

    if (newRecords.length > 0) {
      await db.playLogs.bulkAdd(newRecords);
      newCount = newRecords.length;
    }

    // Step 5: Rebuild B50 snapshot
    emit(0, totalRecords, '正在重新计算 B50...');
    await rebuildB50Snapshot();

    // Step 6: Write sync log
    await db.syncLogs.add({
      syncType: 'full',
      newRecords: newCount,
      totalRecords,
      status: 'success',
      errorMessage: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    const lastSync = new Date().toISOString();
    localStorage.setItem('last_sync_time', lastSync);

    return { newCount, totalCount: totalRecords, lastSync };
  } catch (error: any) {
    await db.syncLogs.add({
      syncType: 'full',
      newRecords: newCount,
      totalRecords,
      status: 'failed',
      errorMessage: error?.message ?? String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function rebuildB50Snapshot(): Promise<void> {
  // 获取所有歌曲元数据
  const songs = await db.songs.toArray();
  const songMap = new Map(songs.map(s => [s.songId, s]));

  // 获取所有战绩记录
  const allRecords = await db.playLogs.toArray();

  // 计算每条记录对 Rating 的贡献
  const scored: Array<{ record: PlayRecord; contribution: number }> = [];
  for (const r of allRecords) {
    const song = songMap.get(r.songId);
    const constVal = getConstForDifficulty(song, r.difficulty);
    if (constVal !== null && constVal > 0) {
      const contribution = calculateRatingContribution(constVal, r.achievements);
      scored.push({ record: r, contribution });
    }
  }

  // 排序取前 50
  scored.sort((a, b) => b.contribution - a.contribution);
  const top50 = scored.slice(0, 50);

  const snapshotTime = new Date().toISOString();
  const b50Records: B50Record[] = top50.map((s) => ({
    songId: s.record.songId,
    difficulty: s.record.difficulty,
    achievements: s.record.achievements,
    dxScore: s.record.dxScore,
    dxRating: s.record.dxRating,
    fcStatus: s.record.fcStatus,
    fsStatus: s.record.fsStatus,
    ratingContribution: s.contribution,
    snapshotTime,
  }));

  // 替换旧快照
  await db.b50Snapshot.clear();
  if (b50Records.length > 0) {
    await db.b50Snapshot.bulkAdd(b50Records);
  }
}
