import type { DifficultyType } from './song';

export interface PlayRecord {
  id?: number;
  songId: number;
  difficulty: DifficultyType;
  achievements: number;
  dxScore: number;
  dxRating: number | null;
  fcStatus: string;
  fsStatus: string;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  fastCount: number;
  lateCount: number;
  maxCombo: number;
  tapCount: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingGain: number | null;
  playTime: string;
  recordMd5: string;
  createdAt: string;
  rate: string;
  constant: number;
}

export interface RatingPoint {
  playDate: string;
  rating: number;
}

export interface WeeklyStats {
  totalPlays: number;
  attendanceDays: number;
  avgAchievements: number;
  bestAchievements: number;
  ratingChange: number;
}
