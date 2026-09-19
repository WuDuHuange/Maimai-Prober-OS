/**
 * 练习计划 —— 从 AI 回复文本里提取被推荐的曲目。
 *
 * 背景：`AIChatPanel` 的「保存为练习计划」把 AI 整段回复存进 `summary`，
 * 但 `songs` 一直写死为 `[]` → `PracticePlanView` 的歌曲胶囊永远是空的，
 * 点进去也没法跳详情。这里补一次**有界**的曲名匹配。
 *
 * 匹配策略（保守优先，宁可漏也不要错）：
 *   1. 用本地曲库标题在文本里找；标题短于 3 字直接跳过（防「藍」「恋」这类误命中）
 *   2. 命中后只看**紧邻的 40 字**判断难度，避免整段文本里出现 "Master" 就把所有歌都算成紫谱
 *   3. 难度只认显式 token（`Re:Master` / `Master` / `Expert` / `礼` / `紫` / `红`），
 *      不认裸 `ReM`，默认落到 master
 */
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';

export interface PlanSong {
  songId: number;
  title: string;
  constant: number | null;
}

const DIFFICULTY_HINTS: { d: DifficultyType; pattern: RegExp }[] = [
  { d: 'remaster', pattern: /re\s*:\s*master|remaster|礼/i },
  { d: 'master', pattern: /master|紫/i },
  { d: 'expert', pattern: /expert|红/i },
];

/** 难度关键词的搜索窗口（字符） */
const HINT_WINDOW = 40;

export function extractPlanSongs(
  content: string,
  songs: Map<number, SongMeta>,
  limit = 12,
): PlanSong[] {
  if (!content) return [];

  const found: PlanSong[] = [];

  for (const song of songs.values()) {
    const title = song.title?.trim();
    if (!title || title.length < 3) continue;

    const at = content.indexOf(title);
    if (at < 0) continue;

    const after = content.slice(at + title.length, at + title.length + HINT_WINDOW);
    let difficulty: DifficultyType = 'master';
    for (const hint of DIFFICULTY_HINTS) {
      if (hint.pattern.test(after)) { difficulty = hint.d; break; }
    }

    found.push({
      songId: song.songId,
      title,
      constant: getConstByDifficulty(song, difficulty),
    });

    if (found.length >= limit) break;
  }

  return found;
}
