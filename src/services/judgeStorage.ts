/**
 * 判定明细存储服务 — 存入 db.appSettings，无需 DB 迁移
 * key: judge_{songId}_{difficulty}
 */
import { db } from '@/services/db';
import type { JudgeDetail, DifficultyType } from '@/types/song';
import { emptyJudgeDetail } from '@/types/song';

function judgeKey(songId: number, difficulty: DifficultyType): string {
  return `judge_${songId}_${difficulty}`;
}

/** 获取某曲目某难度的判定明细 */
export async function getJudgeDetail(songId: number, difficulty: DifficultyType): Promise<JudgeDetail | null> {
  try {
    const row = await db.appSettings.get(judgeKey(songId, difficulty));
    if (row?.value) return JSON.parse(row.value) as JudgeDetail;
  } catch { /* ignore */ }
  return null;
}

/** 保存判定明细 */
export async function saveJudgeDetail(songId: number, difficulty: DifficultyType, detail: JudgeDetail): Promise<void> {
  await db.appSettings.put({
    key: judgeKey(songId, difficulty),
    value: JSON.stringify(detail),
    updatedAt: new Date().toISOString(),
  });
}

/** 获取或创建空判定明细 */
export async function getOrCreateJudgeDetail(songId: number, difficulty: DifficultyType): Promise<JudgeDetail> {
  const existing = await getJudgeDetail(songId, difficulty);
  return existing ?? emptyJudgeDetail();
}
