// Official Diving-Fish API response types
export const API_BASE = import.meta.env.DEV ? '/api-df' : 'https://www.diving-fish.com/api/maimaidxprober';
export const COVERS_BASE = import.meta.env.DEV ? '/df-covers' : 'https://www.diving-fish.com/covers';

export function getCoverUrl(songId: number): string {
  const id = songId > 10000 && songId <= 11000 ? songId - 10000 : songId;
  return `${COVERS_BASE}/${String(id).padStart(5, '0')}.png`;
}

// /music_data response
export interface SongItem {
  id: number;
  title: string;
  type: 'DX' | 'SD';
  ds: number[];
  level: string[];
  cids: number[];
  charts: ChartItem[];
  basic_info: SongBasicInfo;
}

export interface ChartItem {
  notes: number[];
  charter: string;
}

export interface SongBasicInfo {
  title: string;
  artist: string;
  genre: string;
  bpm: number | null;
  from: string;
  is_new: boolean;
}

// /player/records response
export interface OfficialRecordItem {
  song_id: number;
  level_index: number;
  level_label: string;
  level: string;
  title: string;
  type: 'DX' | 'SD';
  achievements: number;
  ds: number;
  dxScore: number;
  fc: string;
  fs: string;
  rate: string;
  ra: number;
}

export interface PlayerRecordsResponse {
  additional_rating: number;
  nickname: string;
  plate: string;
  rating: number;
  records: OfficialRecordItem[];
  username: string;
}

// Sync result
export interface SyncResult {
  newCount: number;
  totalCount: number;
  playerRating: number;
  playerName: string;
  lastSync: string;
}

export interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

// DB models
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

export interface JWTLoginBody {
  username: string;
  password: string;
}

export interface PlayerProfile {
  nickname: string;
  rating: number;
  additionalRating: number;
  plate: string;
  courseRank: number;
  classRank: number;
  trophy: { title: string; color: string };
  /** base64 头像 data URL */
  avatar?: string;
}
