import type { SongMeta, DifficultyType } from '@/types/song';

export function calculateRatingContribution(constant: number, achievements: number): number {
  const maxRating = constant * 1.15;
  const ratio = achievements / 100;
  if (ratio >= 1.0) return constant * 1.15;
  if (ratio >= 0.97) return maxRating - (100 - achievements) * 0.5;
  if (ratio >= 0.94) return (constant - 3.0) + (achievements - 94) * 0.3;
  if (ratio >= 0.90) return (constant - 5.0) + (achievements - 90) * 0.2;
  return Math.max(0, (constant - 7.0) + (achievements - 80) * 0.1);
}

export function getAchievementRank(achievements: number): string {
  if (achievements >= 100.5) return 'SSS+';
  if (achievements >= 100.0) return 'SSS';
  if (achievements >= 99.5) return 'SS+';
  if (achievements >= 99.0) return 'SS';
  if (achievements >= 98.0) return 'S+';
  if (achievements >= 97.0) return 'S';
  if (achievements >= 94.0) return 'AAA';
  if (achievements >= 90.0) return 'AA';
  if (achievements >= 80.0) return 'A';
  if (achievements >= 75.0) return 'BBB';
  if (achievements >= 70.0) return 'BB';
  if (achievements >= 60.0) return 'B';
  if (achievements >= 50.0) return 'C';
  return 'D';
}

export function findSubstituteSongs(
  songs: SongMeta[],
  targetConstant: number,
  offset: number = -0.3
): SongMeta[] {
  const targetLow = targetConstant + offset - 0.2;
  const targetHigh = targetConstant + offset + 0.2;

  return songs.filter(s => {
    for (const diff of ['basic', 'advanced', 'expert', 'master', 'remaster'] as DifficultyType[]) {
      const constMap: Record<string, number | null> = {
        basic: s.basicConst, advanced: s.advancedConst, expert: s.expertConst,
        master: s.masterConst, remaster: s.remasterConst,
      };
      const c = constMap[diff];
      if (c != null && c >= targetLow && c <= targetHigh) return true;
    }
    return false;
  });
}
