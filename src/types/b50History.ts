/**
 * B50 历史快照 —— 用于「这一次 B50 相比上一次，进步在哪」。
 *
 * 设计取舍：
 * 1. **整份 B50 存进一条记录**，而不是只存评分。评分只能说明「涨了」，
 *    要回答「是延续强项还是补弱项」必须能回放当时的谱面结构。
 * 2. **能力指纹（`AbilitySnapshot`）随快照存**，而不是对比时重算：
 *    六维里的「硬度」依赖全量成绩（含 B50 外），而历史全量成绩无法回放，
 *    重算会得到「用今天的数据算过去的 B50」这种假结论。
 * 3. 快照上限 `MAX_HISTORY`，超出按时间淘汰 —— 防止 IndexedDB 无限膨胀。
 */
import type { B50Record } from './b50';
import type { AbilityDimensionId } from './b50Analysis';
import type { DifficultyType } from './song';

/** 分析结果的精简投影（只保留可跨时间比较的字段） */
export interface AbilitySnapshot {
  generatedAt: string;
  dimensions: {
    id: AbilityDimensionId;
    label: string;
    score: number;
    raw: number;
  }[];
  /**
   * 单 tag 相对表现（仅样本 ≥ 3）。
   * 这是判断「强项是否延续 / 弱项是否补上」的主要依据。
   */
  tags: {
    tagId: number;
    name: string;
    group: 'config' | 'evaluation';
    chartCount: number;
    avgOwnDelta: number | null;
  }[];
  structure: {
    avgConstant: number;
    avgAchievement: number;
    achievementStdDev: number;
    countBird: number;
    countBirdPlus: number;
  };
}

export type B50HistorySource = 'sync' | 'manual' | 'bootstrap';

export interface B50HistoryEntry {
  id?: number;
  capturedAt: string;
  /** 官方 Rating；首次引导建立基线时用 B50 理论值兜底 */
  rating: number;
  /** 内容指纹（rating + 每张谱达成率），用于跳过「同步了但成绩没变」的重复快照 */
  fingerprint: string;
  source: B50HistorySource;
  /** 完整 B50（已剥离自增 id） */
  records: B50Record[];
  /** 生成过能力分析时才有 */
  ability?: AbilitySnapshot;
}

/** 谱面在两次快照之间的位移 */
export interface ChartMove {
  songId: number;
  title: string;
  difficulty: DifficultyType;
  constant: number | null;
  achievements: number;
  ratingContribution: number;
  /** 同谱对比时 = to − from；新进/掉出时为 undefined */
  delta?: number;
  tagNames: string[];
}

export interface MetricDelta {
  from: number;
  to: number;
  delta: number;
}

export interface DimensionDelta {
  id: AbilityDimensionId;
  label: string;
  from: number;
  to: number;
  delta: number;
}

/** 单个 tag 的覆盖量与相对表现迁移 */
export interface TagShift {
  tagId: number;
  name: string;
  group: 'config' | 'evaluation';
  fromCount: number;
  toCount: number;
  deltaCount: number;
  /** 相对本人 B50 平均的差值（需要两边都有能力指纹，否则 null） */
  fromDelta: number | null;
  toDelta: number | null;
  /** toDelta − fromDelta */
  deltaDelta: number | null;
}

/**
 * 这段时间的取向：
 * - strength：强项涨得更多（在延续/加码擅长的事）
 * - weakness：弱项涨得更多，或新进谱集中在弱项（在补短板）
 * - mixed：两边都在动，或样本不足以判断
 * - unknown：至少一边没有能力指纹，无法判断强弱迁移
 */
export type TrendVerdict = 'strength' | 'weakness' | 'mixed' | 'unknown';

export interface SnapshotDiff {
  from: B50HistoryEntry;
  to: B50HistoryEntry;
  rating: MetricDelta;
  structure: {
    avgConstant: MetricDelta;
    avgAchievement: MetricDelta;
    stdDev: MetricDelta;
    bird: MetricDelta;
    birdPlus: MetricDelta;
    maxConstant: MetricDelta;
  };
  /** 新进 B50 的谱面 */
  entered: ChartMove[];
  /** 掉出 B50 的谱面 */
  exited: ChartMove[];
  /** 同一谱面成绩提升 */
  improved: ChartMove[];
  /** 同一谱面成绩下降（成绩只增不减时理论上为空，保留以如实呈现） */
  declined: ChartMove[];
  /** 两次都在 B50 里的谱面数 */
  keptCount: number;
  /** 六维变化；任一侧没有能力指纹时为 null */
  dimensions: DimensionDelta[] | null;
  tagShifts: TagShift[];
  verdict: TrendVerdict;
  narrative: { tone: 'up' | 'down' | 'flat'; text: string }[];
}
