import type { PlayRecord } from '@/types/playRecord';
import type { SongMeta } from '@/types/song';

export function formatRecordForAI(record: PlayRecord, song: SongMeta | undefined): string {
  const constMap: Record<string, number | null> = {
    basic: song?.basicConst ?? null,
    advanced: song?.advancedConst ?? null,
    expert: song?.expertConst ?? null,
    master: song?.masterConst ?? null,
    remaster: song?.remasterConst ?? null,
  };
  const constant = constMap[record.difficulty] ?? 'N/A';

  return [
    `- [${record.playTime}] ${song?.title ?? '未知曲目'} [${record.difficulty.toUpperCase()} ${constant}]`,
    `  Achievement: ${record.achievements.toFixed(2)}%`,
    `  DX Score: ${record.dxScore}`,
    `  Fast: ${record.fastCount} | Late: ${record.lateCount}`,
    `  Miss: ${record.missCount} | FC: ${record.fcStatus}`,
  ].join('\n');
}

export function buildCoachContext(
  recentFails: PlayRecord[],
  playerRating: number,
  songMap: Map<number, SongMeta>
): string {
  const recordsText = recentFails
    .map(r => formatRecordForAI(r, songMap.get(r.songId)))
    .join('\n');

  return [
    `## Player Current Status`,
    `- Current Rating: ${playerRating}`,
    ``,
    `## Recent Struggle Records (Last 20 plays below 97% on Master/Re:Master)`,
    recordsText || '  (无近期翻车记录)',
    ``,
    `## Available Song Database Stats`,
    `- Total songs in database: ${songMap.size}`,
    ``,
    `Please analyze these records and provide your coaching diagnosis and practice recommendations.`,
  ].join('\n');
}

export function getConstantRangeContext(
  fails: PlayRecord[],
  songMap: Map<number, SongMeta>
): string {
  const constBuckets = new Map<string, number>();
  for (const r of fails) {
    const map: Record<string, number | null> = {
      basic: songMap.get(r.songId)?.basicConst ?? null,
      advanced: songMap.get(r.songId)?.advancedConst ?? null,
      expert: songMap.get(r.songId)?.expertConst ?? null,
      master: songMap.get(r.songId)?.masterConst ?? null,
      remaster: songMap.get(r.songId)?.remasterConst ?? null,
    };
    const c = map[r.difficulty];
    if (c == null) continue;
    const bucket = `${Math.floor(c)}.0-${Math.floor(c)}.9`;
    constBuckets.set(bucket, (constBuckets.get(bucket) ?? 0) + 1);
  }

  const worst = [...constBuckets.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!worst) return '';

  return `\n## Key Observation\nThe player struggles most in the ${worst[0]} constant range (${worst[1]} records below 97%). Please focus recommendations around this range and its lower 0.2-0.5 substitutes.`;
}
