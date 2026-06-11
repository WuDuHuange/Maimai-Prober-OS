export interface SyncResult {
  newCount: number;
  totalCount: number;
  lastSync: string;
}

export interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

export interface SyncLog {
  id?: number;
  syncType: 'full' | 'incremental';
  newRecords: number;
  totalRecords: number;
  status: 'success' | 'failed' | 'partial';
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface SongNote {
  songId: number;
  difficulty: string;
  content: string;
  updatedAt: string;
}

export interface PlayerProfile {
  nickname: string;
  rating: number;
  additionalRating: number;
  plate: string;
  courseRank: number;
  classRank: number;
  trophy: {
    title: string;
    color: string;
  };
}

export interface PlayRecordItem {
  song_id: number;
  level_index: number;
  achievements: number;
  dx_score: number;
  dx_rating: number | null;
  fc: string;
  fs: string;
  title: string;
  level: string;
  type: string;
}

export interface SongItem {
  song_id: number;
  title: string;
  artist: string;
  category: string;
  bpm: number | null;
  image_url: string;
  charts: ChartInfo[];
}

export interface ChartInfo {
  level: number;
  constant: number;
  charter: string;
}
