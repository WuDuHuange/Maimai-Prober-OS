/**
 * 两份 B50 快照的对比 —— 纯函数，不碰 DB / 网络 / 组件。
 *
 * 回答两个问题：
 * 1. **结构性进步**：Rating、定数结构、达成率、鸟/鸟加、B50 换血。
 * 2. **取向**：这段时间是在延续强项，还是在补弱项？
 *    依据是同一批 tag 的 `avgOwnDelta` 迁移（相对本人 B50 平均，不是跨玩家比较）。
 *
 * ⚠️ 强弱判断只在「两边都生成了能力指纹」时成立。历史 B50 无法重算六维
 *    （硬度依赖全量成绩，无法回放），所以缺指纹时 verdict = unknown，
 *    只给结构性结论，不硬编故事。
 */
import type { B50Record } from '@/types/b50';
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';
import type { ChartTag } from '@/types/tag';
import { TAG_GROUP_IDS } from '@/types/tag';
import type {
  B50HistoryEntry,
  ChartMove,
  DimensionDelta,
  MetricDelta,
  SnapshotDiff,
  TagShift,
  TrendVerdict,
} from '@/types/b50History';

/** 与 b50Analysis 的 tag verdict 阈值保持一致 */
const STRONG = 0.3;
const WEAK = -0.3;
/** tag 结论的最小样本量（与 b50Analysis 相同） */
const MIN_TAG_SAMPLE = 3;
/** 达成率变化小于此值视为「没动」，避免浮点噪声进结论 */
const EPS = 0.005;

type TagGetter = (songId: number, difficulty: DifficultyType) => ChartTag[];

const keyOf = (r: { songId: number; difficulty: string }) => `${r.songId}_${r.difficulty}`;

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function round(v: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

/** 带符号的展示文本（UI 与结论共用，避免各处重复实现） */
export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

function metric(from: number, to: number): MetricDelta {
  return { from: round(from), to: round(to), delta: round(to - from) };
}

interface Structure {
  avgConstant: number;
  maxConstant: number;
  avgAchievement: number;
  stdDev: number;
  bird: number;
  birdPlus: number;
}

function structureOf(records: B50Record[], songMap: Map<number, SongMeta>): Structure {
  const consts = records
    .map(r => r.constant ?? getConstByDifficulty(songMap.get(r.songId), r.difficulty) ?? 0)
    .filter(c => c > 0);
  const ach = records.map(r => r.achievements);
  const avgAch = mean(ach);
  const variance = mean(ach.map(a => (a - avgAch) ** 2));

  return {
    avgConstant: mean(consts),
    maxConstant: consts.length > 0 ? Math.max(...consts) : 0,
    avgAchievement: avgAch,
    stdDev: Math.sqrt(variance),
    bird: ach.filter(a => a >= 100).length,
    birdPlus: ach.filter(a => a >= 100.5).length,
  };
}

function toMove(
  r: B50Record,
  songMap: Map<number, SongMeta>,
  getTags: TagGetter,
  delta?: number,
): ChartMove {
  const song = songMap.get(r.songId);
  return {
    songId: r.songId,
    title: song?.title ?? r.title ?? `#${r.songId}`,
    difficulty: r.difficulty,
    constant: r.constant ?? getConstByDifficulty(song, r.difficulty) ?? null,
    achievements: r.achievements,
    ratingContribution: r.ratingContribution,
    delta,
    tagNames: getTags(r.songId, r.difficulty).map(t => t.name),
  };
}

/** tag 覆盖量 + 相对表现迁移 */
function buildTagShifts(
  from: B50HistoryEntry,
  to: B50HistoryEntry,
  getTags: TagGetter,
): TagShift[] {
  interface Acc {
    name: string;
    group: 'config' | 'evaluation';
    fromCount: number;
    toCount: number;
  }
  const acc = new Map<number, Acc>();

  const bump = (records: B50Record[], side: 'from' | 'to') => {
    for (const r of records) {
      for (const t of getTags(r.songId, r.difficulty)) {
        const cur = acc.get(t.id) ?? {
          name: t.name,
          group: t.groupId === TAG_GROUP_IDS.EVALUATION ? 'evaluation' as const : 'config' as const,
          fromCount: 0,
          toCount: 0,
        };
        if (side === 'from') cur.fromCount += 1;
        else cur.toCount += 1;
        acc.set(t.id, cur);
      }
    }
  };
  bump(from.records, 'from');
  bump(to.records, 'to');

  const fromTags = new Map((from.ability?.tags ?? []).map(t => [t.tagId, t.avgOwnDelta]));
  const toTags = new Map((to.ability?.tags ?? []).map(t => [t.tagId, t.avgOwnDelta]));

  return [...acc.entries()]
    .map(([tagId, a]) => {
      const f = fromTags.get(tagId) ?? null;
      const t = toTags.get(tagId) ?? null;
      return {
        tagId,
        name: a.name,
        group: a.group,
        fromCount: a.fromCount,
        toCount: a.toCount,
        deltaCount: a.toCount - a.fromCount,
        fromDelta: f,
        toDelta: t,
        deltaDelta: f != null && t != null ? round(t - f) : null,
      };
    })
    .sort((a, b) => b.toCount - a.toCount);
}

function buildDimensions(from: B50HistoryEntry, to: B50HistoryEntry): DimensionDelta[] | null {
  if (!from.ability || !to.ability) return null;
  const prev = new Map(from.ability.dimensions.map(d => [d.id, d]));
  const out: DimensionDelta[] = [];
  for (const d of to.ability.dimensions) {
    const p = prev.get(d.id);
    if (!p) continue;
    out.push({
      id: d.id,
      label: d.label,
      from: p.score,
      to: d.score,
      delta: d.score - p.score,
      ...(d.insufficient || p.insufficient ? { insufficient: true } : {}),
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * 判断这段时间的取向。
 *
 * 只看**两边都还有 ≥3 张样本**的 tag，避免「这个 tag 这次只剩 1 张」
 * 这种噪声主导结论。弱项涨幅明显高于强项 → 在补短板；反之 → 在延续强项。
 */
function judge(
  tagShifts: TagShift[],
  hasAbility: boolean,
): { verdict: TrendVerdict; weak: TagShift[]; strong: TagShift[] } {
  if (!hasAbility) return { verdict: 'unknown', weak: [], strong: [] };

  const comparable = tagShifts.filter(
    t => t.deltaDelta != null && t.fromCount >= MIN_TAG_SAMPLE && t.toCount >= MIN_TAG_SAMPLE,
  );
  const weak = comparable
    .filter(t => (t.fromDelta ?? 0) <= WEAK)
    .sort((a, b) => (b.deltaDelta ?? 0) - (a.deltaDelta ?? 0));
  const strong = comparable
    .filter(t => (t.fromDelta ?? 0) >= STRONG)
    .sort((a, b) => (b.deltaDelta ?? 0) - (a.deltaDelta ?? 0));

  if (weak.length === 0 && strong.length === 0) return { verdict: 'mixed', weak, strong };

  const weakGain = mean(weak.map(t => t.deltaDelta ?? 0));
  const strongGain = mean(strong.map(t => t.deltaDelta ?? 0));

  let verdict: TrendVerdict;
  if (weak.length > 0 && weakGain > strongGain + 0.15) verdict = 'weakness';
  else if (strong.length > 0 && strongGain >= weakGain) verdict = 'strength';
  else verdict = 'mixed';

  return { verdict, weak, strong };
}

export function diffSnapshots(
  from: B50HistoryEntry,
  to: B50HistoryEntry,
  songMap: Map<number, SongMeta>,
  getTags: TagGetter,
): SnapshotDiff {
  const prevMap = new Map(from.records.map(r => [keyOf(r), r]));
  const nextMap = new Map(to.records.map(r => [keyOf(r), r]));

  const entered: ChartMove[] = [];
  const exited: ChartMove[] = [];
  const improved: ChartMove[] = [];
  const declined: ChartMove[] = [];
  let keptCount = 0;

  for (const [key, next] of nextMap) {
    const prev = prevMap.get(key);
    if (!prev) {
      entered.push(toMove(next, songMap, getTags));
      continue;
    }
    keptCount += 1;
    const delta = round(next.achievements - prev.achievements);
    if (delta > EPS) improved.push(toMove(next, songMap, getTags, delta));
    else if (delta < -EPS) declined.push(toMove(next, songMap, getTags, delta));
  }
  for (const [key, prev] of prevMap) {
    if (!nextMap.has(key)) exited.push(toMove(prev, songMap, getTags));
  }

  entered.sort((a, b) => b.ratingContribution - a.ratingContribution);
  exited.sort((a, b) => b.ratingContribution - a.ratingContribution);
  improved.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  declined.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const sf = structureOf(from.records, songMap);
  const st = structureOf(to.records, songMap);
  const tagShifts = buildTagShifts(from, to, getTags);
  const dimensions = buildDimensions(from, to);
  const { verdict, weak, strong } = judge(tagShifts, dimensions !== null);

  /* ── 规则结论（只陈述有数据支撑的事实） ── */
  const narrative: SnapshotDiff['narrative'] = [];
  const rating = metric(from.rating, to.rating);
  narrative.push({
    tone: rating.delta > 0 ? 'up' : rating.delta < 0 ? 'down' : 'flat',
    text: `Rating ${from.rating.toFixed(0)} → ${to.rating.toFixed(0)}（${fmtSigned(rating.delta, 0)}）`,
  });

  const constDelta = round(st.avgConstant - sf.avgConstant, 2);
  narrative.push({
    tone: constDelta > 0.05 ? 'up' : constDelta < -0.05 ? 'down' : 'flat',
    text: `定数结构${constDelta > 0.05 ? '上移' : constDelta < -0.05 ? '下移' : '基本不变'}：平均定数 ${sf.avgConstant.toFixed(2)} → ${st.avgConstant.toFixed(2)}（${fmtSigned(constDelta, 2)}）`,
  });

  narrative.push({
    tone: st.avgAchievement > sf.avgAchievement ? 'up' : st.avgAchievement < sf.avgAchievement ? 'down' : 'flat',
    text: `B50 平均达成率 ${sf.avgAchievement.toFixed(2)}% → ${st.avgAchievement.toFixed(2)}%（${fmtSigned(st.avgAchievement - sf.avgAchievement, 2)}pt）`,
  });

  narrative.push({
    tone: 'flat',
    text: `鸟 ${sf.bird} → ${st.bird} 张 · 鸟加 ${sf.birdPlus} → ${st.birdPlus} 张`,
  });

  narrative.push({
    tone: 'flat',
    text: `B50 换血 ${entered.length} 进 / ${exited.length} 出，保留 ${keptCount} 张${improved.length > 0 ? `，同谱刷新 ${improved.length} 张` : ''}`,
  });

  if (dimensions) {
    // 样本不足的维度分数是中性 50，不能拿它说「提升最多 / 回落」
    const rated = dimensions.filter(d => !d.insufficient);
    const ups = rated.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
    const downs = rated.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta);
    if (ups.length > 0) {
      const d = ups[0];
      narrative.push({ tone: 'up', text: `六维提升最多：${d.label} ${d.from} → ${d.to}（${fmtSigned(d.delta, 0)}）` });
    }
    if (downs.length > 0) {
      const d = downs[0];
      narrative.push({ tone: 'down', text: `六维回落：${d.label} ${d.from} → ${d.to}（${fmtSigned(d.delta, 0)}）` });
    }
  }

  for (const t of weak.slice(0, 3)) {
    const dd = t.deltaDelta ?? 0;
    if (dd >= 0.2) {
      narrative.push({
        tone: 'up',
        text: `补弱项：${t.name} ${fmtSigned(t.fromDelta)} → ${fmtSigned(t.toDelta)}（${fmtSigned(dd)}，${t.fromCount} → ${t.toCount} 张）`,
      });
    } else if (dd <= -0.1) {
      narrative.push({
        tone: 'down',
        text: `弱项退步：${t.name} ${fmtSigned(t.fromDelta)} → ${fmtSigned(t.toDelta)}（${fmtSigned(dd)}）`,
      });
    } else {
      narrative.push({
        tone: 'flat',
        text: `弱项未动：${t.name} 仍在 ${fmtSigned(t.toDelta)}`,
      });
    }
  }

  for (const t of strong.slice(0, 2)) {
    const dd = t.deltaDelta ?? 0;
    narrative.push({
      tone: dd >= -0.15 ? 'up' : 'flat',
      text: `${dd >= 0.1 ? '强项加码' : dd <= -0.15 ? '强项回落' : '强项延续'}：${t.name} ${fmtSigned(t.fromDelta)} → ${fmtSigned(t.toDelta)}（${t.fromCount} → ${t.toCount} 张）`,
    });
  }

  // 覆盖量迁移：新进/退出的谱集中在哪些 tag
  const gainedSlots = tagShifts.filter(t => t.deltaCount >= 2).sort((a, b) => b.deltaCount - a.deltaCount).slice(0, 2);
  for (const t of gainedSlots) {
    const weaknessNote = t.toDelta != null && t.toDelta < 0 ? '（这类你目前仍偏弱，属于在扩大接触面）' : '';
    narrative.push({ tone: 'flat', text: `新进谱集中在 ${t.name}（+${t.deltaCount} 张）${weaknessNote}` });
  }

  if (!dimensions) {
    narrative.push({
      tone: 'flat',
      text: '这两份快照至少有一份没生成六维能力分析，因此只对比结构，不判断强弱迁移',
    });
  } else if (from.ability?.estimated || to.ability?.estimated) {
    narrative.push({
      tone: 'flat',
      text: '含补算的六维：硬度按当前全量成绩推算，其余五维与当时一致',
    });
  }

  return {
    from,
    to,
    rating,
    structure: {
      avgConstant: metric(sf.avgConstant, st.avgConstant),
      avgAchievement: metric(sf.avgAchievement, st.avgAchievement),
      stdDev: metric(sf.stdDev, st.stdDev),
      bird: metric(sf.bird, st.bird),
      birdPlus: metric(sf.birdPlus, st.birdPlus),
      maxConstant: metric(sf.maxConstant, st.maxConstant),
    },
    entered,
    exited,
    improved,
    declined,
    keptCount,
    dimensions,
    tagShifts,
    verdict,
    narrative,
  };
}
