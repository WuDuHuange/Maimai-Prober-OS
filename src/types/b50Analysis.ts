/**
 * B50 分析结果类型
 *
 * 基准来源（`peer_stats` 拿不到时的降级链）：
 *   A. peer_stats（OneCatBot 同段聚合）—— **当前 502，不可用**
 *   B. 水鱼 `/chart_stats`（全服口径）—— ✅ 本实现采用
 *   C. AWMC chart-community —— 样本量太小，仅定性
 *
 * ⚠️ 因为用的是 **B（全服不分段）**，本实现里
 *    `peerStatsAvailable === false`，**禁止任何同段比较断言**。
 *    `gap` / `arpi` 都是「对全服平均」而非「对同段平均」，措辞必须写清楚。
 */
import type { DifficultyType } from './song';
import type { ChartTag } from './tag';

/** 六维能力维度 id */
export type AbilityDimensionId =
  | 'power'       // 底力
  | 'precision'   // 精度
  | 'consistency' // 稳定
  | 'breadth'     // 广度
  | 'hardness'    // 硬度（社区认为比标称难的谱占比）
  | 'adaptation'; // 版本适应

export interface AbilityDimension {
  id: AbilityDimensionId;
  label: string;
  /** 0–100 归一化分数 */
  score: number;
  /** 原始值（用于 tooltip / AI 上下文） */
  raw: number;
  /** 原始值的展示文本 */
  rawLabel: string;
  /** 一句话说明这个分数怎么来的 */
  basis: string;
  /** 数据不足时为 true —— 此时 score 是中性值 50，不可作为结论依据 */
  insufficient?: boolean;
}

/** 水度自校准基准（按难度） */
export interface WaterBaseline {
  mean: number;
  std: number;
  count: number;
}

/** 单谱面的分析明细 */
export interface ChartAnalysis {
  songId: number;
  title: string;
  type: 'DX' | 'SD';
  difficulty: DifficultyType;
  levelIndex: number;
  /** 官方定数 */
  constant: number | null;
  achievements: number;
  ratingContribution: number;
  isNew: boolean;
  fcStatus: string;
  /** 社区标注 */
  tags: ChartTag[];
  tagNames: string[];
  hasWaterTag: boolean;
  hasUnderratedTag: boolean;
  /**
   * 全服统计（可能为 null = 无样本）。
   * ⚠️ `avg` 是**全服**平均，含大量低水平玩家（15.0 谱只有 ~82.8%），
   *    **不可**直接与个人达成率相减做强弱判断。
   */
  stat: {
    cnt: number;
    fitDiff: number;
    avg: number;
    stdDev: number;
  } | null;
  /** 水度 = 官方定数 − 拟合定数（正值 = 比官标容易）。无统计时为 null */
  waterIndex: number | null;
  /** 水度的**分难度 z-score**（自校准后才有可比性）。无统计时为 null */
  waterZ: number | null;
  /** 统计口径：偏水（z ≥ +1.5） */
  isWaterByStat: boolean;
  /** 统计口径：偏硬（z ≤ −1.5） */
  isHardByStat: boolean;
  /**
   * 该谱达成率 − 本人 B50 平均达成率。
   * ✅ 这是**B50 内部对比**，不涉及跨玩家比较，是当前唯一合法可用的强弱指标。
   */
  ownDelta: number;
}

/** B50 结构统计 */
export interface B50Structure {
  totalRating: number;
  b15Count: number;
  b35Count: number;
  b15AvgConst: number;
  b35AvgConst: number;
  avgConstant: number;
  maxConstant: number;
  avgAchievement: number;
  achievementStdDev: number;
  /** 达成率 ≥ 100% 的谱面数（鸟） */
  countBird: number;
  /** 达成率 ≥ 100.5% 的谱面数（鸟加） */
  countBirdPlus: number;
  /** 按难度分布 */
  byDifficulty: Record<string, number>;
  /** 定数分布（1 为步长的直方图） */
  constHistogram: { label: string; count: number }[];
}

/** 风险与亮点 */
export interface AnalysisHighlights {
  /** 偏水谱：社区标「水」或统计口径 z ≥ +1.5 */
  waterCharts: ChartAnalysis[];
  /** 偏硬谱：社区标「诈称谱」或统计口径 z ≤ −1.5 */
  underratedCharts: ChartAnalysis[];
  /** ⚠️ B50 **内部**对比：达成率低于自身平均 0.5 以上的谱面 */
  weakCharts: ChartAnalysis[];
  /** ⚠️ B50 **内部**对比：达成率高于自身平均 0.5 以上的谱面 */
  strongCharts: ChartAnalysis[];
}

export interface B50AnalysisResult {
  /** 分析生成时间 */
  generatedAt: string;
  playerRating: number;
  playerName: string;
  /** peer_stats 是否可用（当前恒为 false —— 数据源 502） */
  peerStatsAvailable: boolean;
  /** 实际使用的基准 */
  baseline: 'peer_stats' | 'chart_stats' | 'none';
  /** 基准覆盖的谱面数 / B50 总谱面数 */
  baselineCoverage: { matched: number; total: number };
  /** tag 数据是否可用 */
  tagAvailable: boolean;
  dimensions: AbilityDimension[];
  structure: B50Structure;
  highlights: AnalysisHighlights;
  /** 所有谱面明细（按贡献降序） */
  charts: ChartAnalysis[];
  /** 一句话总评（规则生成，不依赖 AI） */
  headline: string;
}
