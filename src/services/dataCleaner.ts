import CryptoJS from 'crypto-js';
import type { SongMeta, DifficultyType } from '@/types/song';
import type { PlayRecord } from '@/types/playRecord';
import type { PlayRecordItem, SongItem } from '@/types/sync';

const LEVEL_INDEX_MAP: Record<number, DifficultyType> = {
  0: 'basic',
  1: 'advanced',
  2: 'expert',
  3: 'master',
  4: 'remaster',
};

export function mapSongItemToMeta(item: SongItem): SongMeta {
  const getChart = (idx: number) => item.charts?.[idx] ?? null;

  return {
    songId: item.song_id,
    title: item.title ?? '',
    artist: item.artist ?? '',
    category: item.category ?? '',
    bpm: item.bpm ?? null,
    imageUrl: item.image_url ?? '',

    basicLevel: getChart(0)?.level ?? null,
    basicConst: getChart(0)?.constant ?? null,
    advancedLevel: getChart(1)?.level ?? null,
    advancedConst: getChart(1)?.constant ?? null,
    expertLevel: getChart(2)?.level ?? null,
    expertConst: getChart(2)?.constant ?? null,
    masterLevel: getChart(3)?.level ?? null,
    masterConst: getChart(3)?.constant ?? null,
    remasterLevel: getChart(4)?.level ?? null,
    remasterConst: getChart(4)?.constant ?? null,

    basicCharter: getChart(0)?.charter ?? null,
    advancedCharter: getChart(1)?.charter ?? null,
    expertCharter: getChart(2)?.charter ?? null,
    masterCharter: getChart(3)?.charter ?? null,
    remasterCharter: getChart(4)?.charter ?? null,
  };
}

export function mapRecordItemToPlayRecord(item: PlayRecordItem): PlayRecord {
  const now = new Date().toISOString();
  return {
    songId: item.song_id,
    difficulty: LEVEL_INDEX_MAP[item.level_index] ?? 'master',
    achievements: item.achievements,
    dxScore: item.dx_score,
    dxRating: item.dx_rating ?? null,
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
  };
}

export function computeRecordMd5(record: PlayRecordItem): string {
  const input = `${record.song_id}|${record.level_index}|${record.achievements}|${record.dx_score}`;
  return CryptoJS.MD5(input).toString();
}
