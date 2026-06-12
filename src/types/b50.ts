import type { DifficultyType } from './song';

export interface B50Record {
  id?: number;
  songId: number;
  title?: string;
  artist?: string;
  difficulty: DifficultyType;
  constant?: number;
  achievements: number;
  dxScore: number;
  dxRating: number | null;
  fcStatus: string;
  fsStatus: string;
  ratingContribution: number;
  snapshotTime: string;
  isNew?: boolean;
  type?: 'DX' | 'SD';
}
