export interface SongMeta {
  songId: number;
  title: string;
  artist: string;
  category: string;
  bpm: number | null;
  imageUrl: string;

  basicLevel: number | null;
  basicConst: number | null;
  advancedLevel: number | null;
  advancedConst: number | null;
  expertLevel: number | null;
  expertConst: number | null;
  masterLevel: number | null;
  masterConst: number | null;
  remasterLevel: number | null;
  remasterConst: number | null;

  basicCharter: string | null;
  advancedCharter: string | null;
  expertCharter: string | null;
  masterCharter: string | null;
  remasterCharter: string | null;
}

export type DifficultyType = 'basic' | 'advanced' | 'expert' | 'master' | 'remaster';

export const DIFFICULTY_LIST: DifficultyType[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export const DIFFICULTY_LABEL: Record<DifficultyType, string> = {
  basic: 'Basic',
  advanced: 'Advanced',
  expert: 'Expert',
  master: 'Master',
  remaster: 'Re:Master',
};

export function getConstByDifficulty(song: SongMeta, difficulty: DifficultyType): number | null {
  const map: Record<DifficultyType, number | null> = {
    basic: song.basicConst,
    advanced: song.advancedConst,
    expert: song.expertConst,
    master: song.masterConst,
    remaster: song.remasterConst,
  };
  return map[difficulty];
}

export function getLevelByDifficulty(song: SongMeta, difficulty: DifficultyType): number | null {
  const map: Record<DifficultyType, number | null> = {
    basic: song.basicLevel,
    advanced: song.advancedLevel,
    expert: song.expertLevel,
    master: song.masterLevel,
    remaster: song.remasterLevel,
  };
  return map[difficulty];
}
