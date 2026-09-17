import type { PlayRecord } from '../types/playRecord';

/**
 * 判断两条成绩记录中哪一条更优（用于同谱面归并）。
 * 依次比较：达成率 → DX 分数 → 游玩时间（越新越优）。
 */
export function isBetterRecord(a: PlayRecord, b: PlayRecord): boolean {
  if (a.achievements !== b.achievements) return a.achievements > b.achievements;
  if (a.dxScore !== b.dxScore) return a.dxScore > b.dxScore;
  return a.playTime > b.playTime;
}

/**
 * 按谱面（songId + difficulty）归并成绩，每个谱面只保留最优的一条。
 *
 * 背景：recordMd5 由「曲目 + 难度 + 达成率 + DX 分数」构成，成绩每刷新一次
 * 就会在 playLogs 中新增一行且保留旧行（这是刻意的历史留档，
 * SongDetailView 的单曲成绩曲线依赖它）。因此 B50 计算前必须先归并，
 * 否则同一谱面会以多条记录重复挤占 B15 / B35 的名额。
 */
export function collapseByChart(records: PlayRecord[]): PlayRecord[] {
  const best = new Map<string, PlayRecord>();
  for (const r of records) {
    const key = `${r.songId}_${r.difficulty}`;
    const prev = best.get(key);
    if (!prev || isBetterRecord(r, prev)) best.set(key, r);
  }
  return [...best.values()];
}
