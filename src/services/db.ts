import Dexie, { type Table } from 'dexie';
import type { SongMeta } from '@/types/song';
import type { PlayRecord } from '@/types/playRecord';
import type { B50Record } from '@/types/b50';
import type { SyncLog, SongNote, AppSetting } from '@/types/sync';
import type { B50HistoryEntry } from '@/types/b50History';

class MaimaiDatabase extends Dexie {
  songs!: Table<SongMeta, number>;
  playLogs!: Table<PlayRecord, number>;
  b50Snapshot!: Table<B50Record, number>;
  songNotes!: Table<SongNote, [number, string]>;
  syncLogs!: Table<SyncLog, number>;
  appSettings!: Table<AppSetting, string>;
  b50History!: Table<B50HistoryEntry, number>;

  constructor() {
    super('MaimaiProberDB');

    this.version(1).stores({
      songs: 'songId, category, bpm',
      playLogs: '++id, songId, difficulty, achievements, playTime, recordMd5',
      b50Snapshot: '++id, songId, snapshotTime, ratingContribution',
      songNotes: '[songId+difficulty]',
      syncLogs: '++id, syncType, status, startedAt',
      appSettings: 'key',
    });

    // v2：B50 历史快照。只声明新增表，未列出的表沿用 v1 定义。
    this.version(2).stores({
      b50History: '++id, capturedAt, fingerprint',
    });
  }
}

export const db = new MaimaiDatabase();
