/**
 * 选曲复盘 —— 纯函数。
 *
 * 输入是「用户勾选的谱面 + 本地全量成绩 + B50」，输出一份可直接渲染的报告。
 *
 * ⚠️ 口径边界（UI 必须照实写）：
 * - 达成率来自水鱼「历史最好成绩」，**不是这一把的成绩**；
 * - `historyCount` 是成绩刷新次数（recordMd5 去重后的行数），不是游玩次数；
 * - 没有游玩时间，所以不按「最近」排序，也不做任何时间推断。
 */
import type { PlayRecord } from '@/types/playRecord';
import type { B50Record } from '@/types/b50';
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';
import type { ChartTag } from '@/types/tag';
import { TAG_GROUP_IDS } from '@/types/tag';
import type { ChartKey, Milestone, SelectedChart, SelectionReport } from '@/types/selection';
import { collapseByChart } from '@/utils/b50Collapse';
import { getCoverUrl } from '@/types/sync';
import { getAchievementRank, isPlausibleAchievement } from '@/utils/rating';

const keyOf = (songId: number, difficulty: string) => `${songId}_${difficulty}`;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

/** 评级里程碑，**必须按达成率升序** —— 取「第一个还没达到的」 */
const MILESTONES: { label: string; target: number }[] = [
  { label: 'S', target: 97.0 },
  { label: '鸟 SSS', target: 100.0 },
  { label: '鸟加 SSS+', target: 100.5 },
];

function nextMilestone(achievements: number): Milestone | null {
  for (const m of MILESTONES) {
    if (achievements < m.target) {
      return { label: m.label, target: m.target, gap: round(m.target - achievements) };
    }
  }
  return null;
}

/** 强/弱判定阈值 —— 与 B50 分析里的 tag verdict 保持一致 */
const STRONG = 0.3;
const WEAK = -0.3;

export interface SelectionInput {
  keys: ChartKey[];
  /** 全量历史成绩（未归并） */
  plays: PlayRecord[];
  b50List: B50Record[];
  /** 已生成分析时的 B50 平均达成率；没有分析传 0 */
  b50AvgAchievement: number;
  songMap: Map<number, SongMeta>;
  getTags: (songId: number, difficulty: DifficultyType) => ChartTag[];
}

export function analyzeSelection(input: SelectionInput): SelectionReport {
  const { keys, b50List, b50AvgAchievement, songMap, getTags } = input;
  // 脏数据防线：实测库里有 188.41% / 0% 的记录，直接参与均值会把报告整体带偏
  const plays = input.plays.filter(p => isPlausibleAchievement(p.achievements));

  // 每个谱面的最优成绩（B50 同口径）
  const bestByKey = new Map(collapseByChart(plays).map(r => [keyOf(r.songId, r.difficulty), r]));
  // 每个谱面的历史行（按自增 id = 入库顺序，即成绩刷新顺序）
  const historyByKey = new Map<string, PlayRecord[]>();
  for (const r of plays) {
    const k = keyOf(r.songId, r.difficulty);
    const arr = historyByKey.get(k);
    if (arr) arr.push(r);
    else historyByKey.set(k, [r]);
  }

  const charts: SelectedChart[] = [];
  for (const key of keys) {
    const best = bestByKey.get(keyOf(key.songId, key.difficulty));
    if (!best) continue;

    const song = songMap.get(key.songId);
    const history = (historyByKey.get(keyOf(key.songId, key.difficulty)) ?? [])
      .slice()
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const first = history.length > 0 ? history[0].achievements : null;
    const gain = first != null && history.length >= 2 ? round(best.achievements - first) : null;

    charts.push({
      songId: key.songId,
      title: song?.title ?? best.songId.toString(),
      artist: song?.artist ?? '',
      difficulty: key.difficulty,
      constant: best.constant ?? getConstByDifficulty(song, key.difficulty) ?? null,
      type: song?.type ?? 'SD',
      coverUrl: getCoverUrl(key.songId),
      achievements: best.achievements,
      dxScore: best.dxScore,
      fcStatus: best.fcStatus,
      rate: best.rate || getAchievementRank(best.achievements),
      tags: getTags(key.songId, key.difficulty),
      ownDelta: b50AvgAchievement > 0 ? round(best.achievements - b50AvgAchievement) : null,
      historyCount: history.length,
      firstAchievement: first,
      gain,
      next: nextMilestone(best.achievements),
    });
  }

  charts.sort((a, b) => b.achievements - a.achievements);

  const ach = charts.map(c => c.achievements);
  const consts = charts.map(c => c.constant).filter((c): c is number => c != null);
  const deltas = charts.map(c => c.ownDelta).filter((d): d is number => d != null);
  const b50Consts = b50List
    .map(r => r.constant)
    .filter((c): c is number => c != null);

  /* ── tag 覆盖 ── */
  interface TagAcc { name: string; group: 'config' | 'evaluation'; count: number; deltas: number[] }
  const tagAcc = new Map<number, TagAcc>();
  for (const c of charts) {
    for (const t of c.tags) {
      const cur = tagAcc.get(t.id) ?? {
        name: t.name,
        group: t.groupId === TAG_GROUP_IDS.EVALUATION ? 'evaluation' as const : 'config' as const,
        count: 0,
        deltas: [],
      };
      cur.count += 1;
      if (c.ownDelta != null) cur.deltas.push(c.ownDelta);
      tagAcc.set(t.id, cur);
    }
  }
  const tags = [...tagAcc.entries()]
    .map(([tagId, a]) => ({
      tagId,
      name: a.name,
      group: a.group,
      count: a.count,
      avgOwnDelta: a.deltas.length > 0 ? round(mean(a.deltas)) : null,
    }))
    .filter(t => t.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  /* ── 两个重点谱面 ── */
  const gainCandidates = charts.filter(c => c.gain != null && c.gain > 0.05);
  const biggestGain = gainCandidates.length > 0
    ? gainCandidates.reduce((a, b) => ((b.gain ?? 0) > (a.gain ?? 0) ? b : a))
    : null;

  const nearCandidates = charts.filter(c => c.next != null && c.next.gap <= 1.0);
  const nearMiss = nearCandidates.length > 0
    ? nearCandidates.reduce((a, b) => ((b.next!.gap < a.next!.gap) ? b : a))
    : null;

  /* ── 规则结论 ── */
  const verdicts: string[] = [];
  if (charts.length > 0) {
    const avgAch = mean(ach);
    const avgConst = mean(consts);
    const b50AvgConst = mean(b50Consts);

    if (b50AvgAchievement > 0) {
      const d = avgAch - b50AvgAchievement;
      verdicts.push(
        `这 ${charts.length} 首平均达成 ${avgAch.toFixed(2)}%，` +
        `${d >= 0 ? '高于' : '低于'}你的 B50 平均（${b50AvgAchievement.toFixed(2)}%）${Math.abs(d).toFixed(2)}pt`,
      );
    } else {
      verdicts.push(`这 ${charts.length} 首平均达成 ${avgAch.toFixed(2)}%`);
    }

    if (consts.length > 0 && b50Consts.length > 0) {
      const d = avgConst - b50AvgConst;
      verdicts.push(
        `平均定数 ${avgConst.toFixed(2)}，比 B50 的 ${b50AvgConst.toFixed(2)} ` +
        `${d >= 0 ? '高' : '低'} ${Math.abs(d).toFixed(2)} —— ${d >= 0.15 ? '在练更难的谱' : d <= -0.15 ? '偏轻松/恢复向' : '难度档位接近 B50'}`,
      );
    }

    if (tags.length > 0) {
      const top = tags.slice(0, 3).map(t => `${t.name}（${t.count} 张）`).join('、');
      verdicts.push(`类型集中在：${top}`);
    }

    const strong = charts.filter(c => c.ownDelta != null && c.ownDelta >= STRONG).length;
    const weak = charts.filter(c => c.ownDelta != null && c.ownDelta <= WEAK).length;
    if (b50AvgAchievement > 0) {
      verdicts.push(`相对你的 B50 平均：强项向 ${strong} 张 / 弱项向 ${weak} 张 / 持平 ${charts.length - strong - weak} 张`);
    }

    const birdPlus = charts.filter(c => c.achievements >= 100.5).length;
    if (birdPlus > 0) verdicts.push(`其中 ${birdPlus} 张已经鸟加（≥100.5%）`);
  }

  return {
    charts,
    summary: {
      count: charts.length,
      avgAchievement: round(mean(ach)),
      avgConstant: round(mean(consts)),
      avgOwnDelta: deltas.length > 0 ? round(mean(deltas)) : null,
      b50AvgAchievement: round(b50AvgAchievement),
      b50AvgConstant: round(mean(b50Consts)),
      birdCount: charts.filter(c => c.achievements >= 100).length,
      birdPlusCount: charts.filter(c => c.achievements >= 100.5).length,
      strongCount: charts.filter(c => c.ownDelta != null && c.ownDelta >= STRONG).length,
      weakCount: charts.filter(c => c.ownDelta != null && c.ownDelta <= WEAK).length,
    },
    tags,
    biggestGain,
    nearMiss,
    verdicts,
  };
}
