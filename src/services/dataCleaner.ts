import CryptoJS from 'crypto-js';
import type { SongItem, OfficialRecordItem } from '@/types/sync';
import type { SongMeta, DifficultyType } from '@/types/song';
import type { PlayRecord } from '@/types/playRecord';

const LEVEL_INDEX_MAP: Record<number, DifficultyType> = {
  0: 'basic', 1: 'advanced', 2: 'expert', 3: 'master', 4: 'remaster',
};

export function mapSongItemToMeta(item: SongItem): SongMeta {
  const getConst = (idx: number) => item.ds[idx] ?? null;
  const getLevel = (idx: number) => item.level[idx] ?? null;

  return {
    songId: Number(item.id),
    title: item.title,
    artist: item.basic_info?.artist ?? '',
    genre: item.basic_info?.genre ?? '',
    bpm: item.basic_info?.bpm ?? null,
    type: item.type,
    from: item.basic_info?.from ?? '',
    isNew: item.basic_info?.is_new ?? false,
    basicConst: getConst(0),
    advancedConst: getConst(1),
    expertConst: getConst(2),
    masterConst: getConst(3),
    remasterConst: getConst(4),
    basicLevel: getLevel(0),
    advancedLevel: getLevel(1),
    expertLevel: getLevel(2),
    masterLevel: getLevel(3),
    remasterLevel: getLevel(4),
  };
}

export function mapOfficialRecord(item: OfficialRecordItem): PlayRecord {
  const now = new Date().toISOString();
  return {
    songId: Number(item.song_id),
    difficulty: LEVEL_INDEX_MAP[item.level_index] ?? 'master',
    achievements: item.achievements,
    dxScore: item.dxScore,
    dxRating: item.ra ?? null,
    fcStatus: item.fc || 'none',
    fsStatus: item.fs || 'none',
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    missCount: 0,
    fastCount: 0,
    lateCount: 0,
    maxCombo: 0,
    tapCount: 0,
    ratingBefore: null,
    ratingAfter: null,
    ratingGain: null,
    playTime: now,
    recordMd5: computeRecordMd5(item),
    createdAt: now,
    rate: item.rate ?? '',
    constant: item.ds,
  };
}

export function computeRecordMd5(record: OfficialRecordItem): string {
  return CryptoJS.MD5(`${record.song_id}|${record.level_index}|${record.achievements.toFixed(4)}|${record.dxScore}`).toString();
}
