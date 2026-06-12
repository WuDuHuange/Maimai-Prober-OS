export type DifficultyType = 'basic' | 'advanced' | 'expert' | 'master' | 'remaster';

export const DIFFICULTY_LIST: DifficultyType[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export const DIFFICULTY_LABEL: Record<DifficultyType, string> = {
  basic: 'Basic', advanced: 'Advanced', expert: 'Expert', master: 'Master', remaster: 'Re:Master',
};

export const DIFFICULTY_LABEL_SHORT: Record<DifficultyType, string> = {
  basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM',
};

// DB-stored song metadata (flattened from API response)
export interface SongMeta {
  songId: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number | null;
  type: 'DX' | 'SD';
  from: string;
  isNew: boolean;
  basicConst: number | null;
  advancedConst: number | null;
  expertConst: number | null;
  masterConst: number | null;
  remasterConst: number | null;
  basicLevel: string | null;
  advancedLevel: string | null;
  expertLevel: string | null;
  masterLevel: string | null;
  remasterLevel: string | null;
}

export function getConstByDifficulty(song: SongMeta | undefined, d: DifficultyType): number | null {
  if (!song) return null;
  const map: Record<DifficultyType, number | null> = {
    basic: song.basicConst, advanced: song.advancedConst,
    expert: song.expertConst, master: song.masterConst, remaster: song.remasterConst,
  };
  return map[d] ?? null;
}

export function getLevelByDifficulty(song: SongMeta | undefined, d: DifficultyType): string | null {
  if (!song) return null;
  const map: Record<DifficultyType, string | null> = {
    basic: song.basicLevel, advanced: song.advancedLevel,
    expert: song.expertLevel, master: song.masterLevel, remaster: song.remasterLevel,
  };
  return map[d] ?? null;
}
