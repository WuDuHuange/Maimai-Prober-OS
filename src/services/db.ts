import Dexie, { type Table } from 'dexie';
import type { SongMeta } from '@/types/song';
import type { PlayRecord } from '@/types/playRecord';
import type { B50Record } from '@/types/b50';
import type { SyncLog, SongNote, AppSetting } from '@/types/sync';

class MaimaiDatabase extends Dexie {
  songs!: Table<SongMeta, number>;
  playLogs!: Table<PlayRecord, number>;
  b50Snapshot!: Table<B50Record, number>;
  songNotes!: Table<SongNote, [number, string]>;
  syncLogs!: Table<SyncLog, number>;
  appSettings!: Table<AppSetting, string>;

  constructor() {
    super('MaimaiProberDB');

    this.version(1).stores({
      songs: 'songId, category, bpm',
      playLogs: '++id, songId, difficulty, achievements, playTime, recordMd5',
      b50Snapshot: '++id, songId, snapshotTime',
      songNotes: '[songId+difficulty]',
      syncLogs: '++id, syncType, status, startedAt',
      appSettings: 'key',
    });
  }
}

export const db = new MaimaiDatabase();
