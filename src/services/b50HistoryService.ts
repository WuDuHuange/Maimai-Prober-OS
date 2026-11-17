/**
 * B50 历史快照的数据访问层。
 *
 * 与 store 的分工：这里只管 IndexedDB 读写与去重/裁剪，不持有响应式状态。
 * 同步流程（非组件环境）也能直接调用 `captureB50Snapshot()`。
 */
import { db } from './db';
import type { AbilitySnapshot, B50HistoryEntry, B50HistorySource } from '@/types/b50History';
import type { B50Record } from '@/types/b50';
import type { B50AnalysisResult } from '@/types/b50Analysis';

/** 把一次完整分析压成可跨时间比较的指纹 */
export function buildAbilitySnapshot(result: B50AnalysisResult): AbilitySnapshot {
  return {
    generatedAt: result.generatedAt,
    dimensions: result.dimensions.map(d => ({
      id: d.id,
      label: d.label,
      score: d.score,
      raw: d.raw,
    })),
    tags: result.tagPerformance.map(t => ({
      tagId: t.tagId,
      name: t.name,
      group: t.group,
      chartCount: t.chartCount,
      avgOwnDelta: t.avgOwnDelta,
    })),
    structure: {
      avgConstant: result.structure.avgConstant,
      avgAchievement: result.structure.avgAchievement,
      achievementStdDev: result.structure.achievementStdDev,
      countBird: result.structure.countBird,
      countBirdPlus: result.structure.countBirdPlus,
    },
  };
}

/**
 * 保留的快照上限。
 * 40 条 ≈ 40 × 50 谱 ≈ 2000 行，体积在 1 MB 量级；再多的历史对「上一次 vs 这一次」没有价值。
 */
export const MAX_HISTORY = 40;

/** FNV-1a 32 位 —— 只为去重，不做安全用途 */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 内容指纹：每张谱的 (songId, 难度, 达成率, DX 分)，排序后拼接。
 *
 * ⚠️ 刻意**不含 rating**：指纹要同时用于「去重」和「把分析结果挂到对应快照上」。
 *    后者发生在分析流程里，此时的 rating 可能来自 `computedRating`（B50 理论值）
 *    而非官方 rating，带上 rating 会导致匹配不上、能力指纹静默丢失。
 *    谱面完全相同而 rating 不同，在实践中不会发生（rating 就是这 50 张的 ra 之和）。
 */
export function b50Fingerprint(records: B50Record[]): string {
  const body = records
    .map(r => `${r.songId}:${r.difficulty}:${r.achievements.toFixed(2)}:${r.dxScore}`)
    .sort()
    .join('|');
  return hash(body);
}

/** 剥离自增 id，避免历史表里出现与当前表冲突的主键 */
function stripIds(records: B50Record[]): B50Record[] {
  return records.map(r => {
    const { id: _id, ...rest } = r;
    return rest;
  });
}

/**
 * 保存一份快照。
 * @returns 新快照；内容与最新一条完全一致时返回 null（不重复入库）
 */
export async function captureB50Snapshot(
  records: B50Record[],
  rating: number,
  source: B50HistorySource,
): Promise<B50HistoryEntry | null> {
  if (records.length === 0) return null;

  const clean = stripIds(records);
  const fingerprint = b50Fingerprint(clean);

  const latest = await db.b50History.orderBy('capturedAt').last();
  if (latest && latest.fingerprint === fingerprint) return null;

  const entry: B50HistoryEntry = {
    capturedAt: new Date().toISOString(),
    rating,
    fingerprint,
    source,
    records: clean,
  };

  const id = await db.b50History.add(entry);
  await trimHistory();
  return { ...entry, id };
}

/** 超出上限时按时间淘汰最旧的几条 */
async function trimHistory(): Promise<void> {
  const count = await db.b50History.count();
  if (count <= MAX_HISTORY) return;
  const stale = await db.b50History
    .orderBy('capturedAt')
    .limit(count - MAX_HISTORY)
    .primaryKeys();
  await db.b50History.bulkDelete(stale as number[]);
}

/**
 * 把能力指纹附加到「与当前 B50 内容一致」的快照上。
 * 分析跑完后调用 —— 历史快照无法重算六维，只能存当时的分析结果。
 */
export async function attachAbilitySnapshot(
  fingerprint: string,
  ability: AbilitySnapshot,
): Promise<boolean> {
  const latest = await db.b50History.orderBy('capturedAt').last();
  if (!latest || latest.fingerprint !== fingerprint || latest.id == null) return false;
  await db.b50History.update(latest.id, { ability });
  return true;
}

export async function listB50History(): Promise<B50HistoryEntry[]> {
  return db.b50History.orderBy('capturedAt').toArray();
}

export async function deleteB50History(id: number): Promise<void> {
  await db.b50History.delete(id);
}

export async function countB50History(): Promise<number> {
  return db.b50History.count();
}
