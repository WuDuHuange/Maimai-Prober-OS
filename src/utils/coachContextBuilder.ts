import type { PlayRecord } from '@/types/playRecord';
import type { SongMeta } from '@/types/song';
import type { B50Record } from '@/types/b50';

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

/** 构建可用曲库上下文（筛选与翻车定数范围相关的曲目供 AI 推荐） */
export function buildSongDatabaseContext(
  fails: PlayRecord[],
  songMap: Map<number, SongMeta>,
  maxSongs = 50
): string {
  // 找到翻车定数范围
  const failConsts: number[] = [];
  for (const r of fails) {
    const map: Record<string, number | null> = {
      basic: songMap.get(r.songId)?.basicConst ?? null,
      advanced: songMap.get(r.songId)?.advancedConst ?? null,
      expert: songMap.get(r.songId)?.expertConst ?? null,
      master: songMap.get(r.songId)?.masterConst ?? null,
      remaster: songMap.get(r.songId)?.remasterConst ?? null,
    };
    const c = map[r.difficulty];
    if (c != null) failConsts.push(c);
  }

  const minConst = failConsts.length > 0 ? Math.min(...failConsts) : 10;
  const maxConst = failConsts.length > 0 ? Math.max(...failConsts) : 14;

  // 筛选相关曲目：在翻车定数附近（下限 -1，上限 +0.5）
  const relevant: { title: string; type: string; diffs: string }[] = [];
  for (const song of songMap.values()) {
    const diffs: string[] = [];
    const consts: Record<string, number | null> = {
      Basic: song.basicConst, Advanced: song.advancedConst,
      Expert: song.expertConst, Master: song.masterConst, ReM: song.remasterConst,
    };
    let inRange = false;
    for (const [level, c] of Object.entries(consts)) {
      if (c != null && c >= minConst - 1 && c <= maxConst + 0.5) {
        diffs.push(`${level} ${c.toFixed(1)}`);
        inRange = true;
      }
    }
    if (inRange) {
      relevant.push({
        title: song.title,
        type: song.type,
        diffs: diffs.join(' / '),
      });
    }
  }

  // 按定数排序（粗略用难度字符串长度）
  relevant.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  const selected = relevant.slice(0, maxSongs);

  const lines = selected.map(s =>
    `- ${s.title} [${s.type}] (${s.diffs})`
  );

  return [
    `## Available Song Database (for recommendations)`,
    `- Total songs: ${songMap.size}`,
    `- Relevant songs in constant range ${minConst.toFixed(1)}~${maxConst.toFixed(1)}: ${relevant.length}`,
    ``,
    ...lines,
    ``,
    `Please recommend practice songs ONLY from the above list. Include song title, type, recommended difficulty, and why it helps.`,
  ].join('\n');
}

/** 构建 B50 核心数据上下文 */
export function buildB50Context(b50List: B50Record[]): string {
  const b15 = b50List.filter(b => b.isNew).slice(0, 15);
  const b35 = b50List.filter(b => !b.isNew).slice(0, 35);

  const formatB50 = (b: B50Record) =>
    `- ${b.title ?? `#${b.songId}`} [${b.type ?? '?'}] ${b.difficulty.toUpperCase()} 定数${b.constant ?? '?'} | 达成 ${b.achievements.toFixed(2)}% | Rating贡献 ${b.ratingContribution?.toFixed(0) ?? '?'} | ${b.fcStatus}`;

  const lines = ['## B50 核心数据'];

  if (b15.length > 0) {
    lines.push(`### B15 新版本 (Top ${b15.length})`);
    lines.push(...b15.map(formatB50));
    lines.push(`B15 Rating 贡献合计: ${b15.reduce((s, b) => s + (b.ratingContribution ?? 0), 0).toFixed(0)}`);
  }

  if (b35.length > 0) {
    lines.push(`### B35 旧版本 (Top ${b35.length})`);
    lines.push(...b35.map(formatB50));
    lines.push(`B35 Rating 贡献合计: ${b35.reduce((s, b) => s + (b.ratingContribution ?? 0), 0).toFixed(0)}`);
  }

  lines.push(`B50 总 Rating: ${b50List.reduce((s, b) => s + (b.ratingContribution ?? 0), 0).toFixed(0)}`);

  return lines.join('\n');
}
