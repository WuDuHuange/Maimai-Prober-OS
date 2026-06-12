import type { PlayRecord } from '@/types/playRecord';
import type { B50Record } from '@/types/b50';
import type { SongMeta, DifficultyType } from '@/types/song';
import type { SyncResult, SyncProgress } from '@/types/sync';
import { db } from './db';
import { fetchSongList, fetchPlayerRecords } from './divingFishApi';
import { mapSongItemToMeta, mapOfficialRecord, computeRecordMd5 } from './dataCleaner';

function getConstForDifficulty(song: SongMeta | undefined, d: DifficultyType): number | null {
  if (!song) return null;
  const map: Record<string, number | null> = { basic: song.basicConst, advanced: song.advancedConst, expert: song.expertConst, master: song.masterConst, remaster: song.remasterConst };
  return map[d] ?? null;
}

function calculateRatingContribution(constant: number, achievements: number): number {
  const ratio = achievements / 100;
  if (ratio >= 1.0) return constant * 1.15;
  if (ratio >= 0.97) return constant * 1.15 - (100 - achievements) * 0.5;
  if (ratio >= 0.94) return (constant - 3.0) + (achievements - 94) * 0.3;
  if (ratio >= 0.90) return (constant - 5.0) + (achievements - 90) * 0.2;
  return Math.max(0, (constant - 7.0) + (achievements - 80) * 0.1);
}

export async function fullSync(
  importToken: string,
  onProgress?: (p: SyncProgress) => void
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const emit = (current: number, total: number, message: string) => onProgress?.({ current, total, message });

  try {
    // Step 1: Fetch song library
    emit(0, 3, '获取曲库...');
    const { songs: songItems } = await fetchSongList();
    const songMetas = songItems.map(mapSongItemToMeta);
    await db.songs.bulkPut(songMetas);
    emit(1, 3, `曲库: ${songMetas.length} 首`);

    // Step 2: Fetch player records
    emit(1, 3, '获取战绩...');
    const profileData = await fetchPlayerRecords(importToken);
    const records = profileData.records ?? [];
    emit(2, 3, `战绩: ${records.length} 条`);

    // Step 3: Dedup and insert
    const existingMd5s = new Set((await db.playLogs.toArray()).map(r => r.recordMd5));
    const newRecords: PlayRecord[] = [];
    for (const item of records) {
      const md5 = computeRecordMd5(item);
      if (!existingMd5s.has(md5)) {
        const rec = mapOfficialRecord(item);
        rec.recordMd5 = md5;
        newRecords.push(rec);
      }
    }

    if (newRecords.length > 0) {
      await db.playLogs.bulkAdd(newRecords);
    }

    // Step 4: Rebuild B50
    emit(3, 3, '计算 B50...');
    await rebuildB50Snapshot();

    // Sync log
    await db.syncLogs.add({
      syncType: newRecords.length > 0 ? 'incremental' : 'full',
      newRecords: newRecords.length,
      totalRecords: records.length,
      status: 'success',
      errorMessage: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    const lastSync = new Date().toISOString();
    localStorage.setItem('last_sync_time', lastSync);

    return {
      newCount: newRecords.length,
      totalCount: records.length,
      playerRating: profileData.rating ?? 0,
      playerName: profileData.nickname ?? '',
      lastSync,
    };
  } catch (err: any) {
    await db.syncLogs.add({
      syncType: 'full',
      newRecords: 0,
      totalRecords: 0,
      status: 'failed',
      errorMessage: err?.message ?? String(err),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    throw err;
  }
}

async function rebuildB50Snapshot(): Promise<void> {
  const songs = await db.songs.toArray();
  const songMap = new Map(songs.map(s => [s.songId, s]));
  const allRecords = await db.playLogs.toArray();

  // Debug: check first 3 songs and records
  if (songs.length > 0) console.log('[B50] 示例歌曲:', JSON.stringify(songs[0]));
  if (allRecords.length > 0) console.log('[B50] 示例记录:', JSON.stringify(allRecords[0]));
  if (songs.length > 0 && allRecords.length > 0) {
    const r0 = allRecords[0];
    const s0 = songMap.get(r0.songId);
    console.log('[B50] 记录#1 songId:', r0.songId, 'difficulty:', r0.difficulty, '歌曲找到:', !!s0);
    if (s0) console.log('[B50] 歌曲常量:', { basic: s0.basicConst, advanced: s0.advancedConst, expert: s0.expertConst, master: s0.masterConst, remaster: s0.remasterConst });
  }

  const scored: Array<{ record: PlayRecord; contribution: number }> = [];
  for (const r of allRecords) {
    const song = songMap.get(r.songId);
    const c = getConstForDifficulty(song, r.difficulty);
    if (c && c > 0) {
      scored.push({ record: r, contribution: calculateRatingContribution(c, r.achievements) });
    }
  }

  scored.sort((a, b) => b.contribution - a.contribution);
  const top50 = scored.slice(0, 50);

  const now = new Date().toISOString();
  const b50Records: B50Record[] = top50.map(s => ({
    songId: s.record.songId,
    difficulty: s.record.difficulty,
    achievements: s.record.achievements,
    dxScore: s.record.dxScore,
    dxRating: s.record.dxRating,
    fcStatus: s.record.fcStatus,
    fsStatus: s.record.fsStatus,
    ratingContribution: s.contribution,
    snapshotTime: now,
    constant: getConstForDifficulty(songMap.get(s.record.songId), s.record.difficulty) ?? undefined,
  }));

  await db.b50Snapshot.clear();
  if (b50Records.length > 0) await db.b50Snapshot.bulkAdd(b50Records);
  console.log('[B50] 歌曲数:', songs.length, '记录数:', allRecords.length, '有效评分:', scored.length, 'B50条目:', b50Records.length);
}
