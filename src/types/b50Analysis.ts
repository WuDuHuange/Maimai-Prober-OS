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
  | 'balance'     // 专项均衡（原「广度」—— 见下方说明）
  | 'hardness'    // 硬度（混合口径，见 HardnessBreakdown）
  | 'adaptation'; // 版本适应

/**
 * ⚠️ 为什么「广度」被换成「专项均衡」
 *
 * 旧口径 `广度 = 配置组 14 个 tag 的香农熵 ÷ ln(14)` 有四个致命问题：
 * 1. 熵对样本量极敏感 —— B50 只有 50 首却要摊到 14 个类别，数值天然偏低且噪声大；
 * 2. 配置 tag 是众包标注，各 tag 覆盖量差 4 倍（交互 580 vs 反手 147），熵被覆盖偏差污染；
 * 3. **不可操作** —— 用户看到「广度 62 分」不知道该练什么；
 * 4. 与底力共线 —— 打得越难，被标注的 tag 越多，熵自然越高。
 *
 * 新口径改用 DXRating「评价」组 tag（星星谱/键盘谱/体力谱/底力谱/高物量）：
 * 直接回答「你在哪类谱上强、哪类弱」，既有个体区分度又能落到练习动作。
 */

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

/** 相对表现判定（一律基于 `ownDelta`，即 B50 内部对比，**不是**跨玩家比较） */
export type RelativeVerdict = 'strong' | 'weak' | 'neutral' | 'insufficient';

/**
 * 类型专项表现 —— 基于 DXRating「评价」组 tag（星星谱 / 键盘谱 / 体力谱 / 底力谱 / 高物量）。
 *
 * ⚠️ 这些是**社区标注**，只覆盖被标注过的谱面。`chartCount` 就是实际命中数，
 *    覆盖率低时 `verdict` 会落到 `insufficient`，UI 需明示而不是硬给结论。
 */
export interface TypeSpecialty {
  tagId: number;
  /** 类型名，如「星星谱」 */
  name: string;
  /** 类型说明（DXRating 原文） */
  description: string;
  /** B50 中命中该类型的谱面数 */
  chartCount: number;
  /** 这些谱面的平均达成率 */
  avgAchievement: number | null;
  /** 这些谱面的平均 ownDelta（相对本人 B50 平均）。正值 = 这类谱打得比平均好 */
  avgOwnDelta: number | null;
  verdict: RelativeVerdict;
  /** 该类型里表现最好/最差的代表谱（供 UI 与 AI 引用） */
  bestChart: TypeChartRef | null;
  worstChart: TypeChartRef | null;
}

/** 类型/曲风聚合里的单谱引用 */
export interface TypeChartRef {
  songId: number;
  title: string;
  difficulty: DifficultyType;
  constant: number | null;
  achievements: number;
  ownDelta: number;
}

/**
 * 曲风口味 —— 基于水鱼曲库的**官方 genre 字段**（不是社区标注，可靠度高）。
 * 实测值域：舞萌 / niconico & VOCALOID / 其他游戏 / 东方Project / 音击&中二节奏 / 流行&动漫 / 宴会場
 *
 * ⚠️ 口径（2026-09-20 修正）：**只描述「喜欢打什么」，不评强弱**。
 *    它回答的是「我的选曲兴趣结构如何」，与水平无关 ——
 *    原先带 `verdict`（强项/短板）与 `avgOwnDelta`，等于把口味分析做成了能力分析，是错的。
 *    想看强弱请用「技术类型专项」与「打谱偏向」。
 */
export interface GenreTaste {
  genre: string;
  chartCount: number;
  /** 占 B50 的比例 0–1 */
  share: number;
  /** 平均达成率 —— 仅作中性描述，**不参与任何强弱判定** */
  avgAchievement: number | null;
  /** 平均定数 —— 反映这类曲目在你 B50 里的难度档位，同属中性描述 */
  avgConstant: number | null;
}

/**
 * 打谱偏向 —— tag **两两组合**的相对表现。
 *
 * 回答「哪些 tag 组合的歌我打得好、哪些不行」，与「技术类型专项」（单 tag）互补：
 * 单 tag 看不出组合效应 —— 例如「星星谱」整体持平，但「星星谱 + 交互」可能明显偏低。
 *
 * ⚠️ 只统计样本 ≥ 3 张的组合：组合的样本量天然比单 tag 小，
 *    门槛不够的话结果会被偶然波动主导。
 * ⚠️ 参与组合的 tag 只取**配置组 + 评价组**。难度组（水 / 诈称谱）已由
 *    「谱面性质」与「硬度」单独分析，混进来只会稀释信号。
 */
export interface TypeCombo {
  /** 组成该组合的两个 tag id（升序） */
  tagIds: [number, number];
  /** 展示名，如「星星谱 + 交互」 */
  label: string;
  /** B50 中同时命中这两个 tag 的谱面数 */
  chartCount: number;
  avgAchievement: number | null;
  /** 相对本人 B50 平均的差值。正 = 这类组合打得比平均好 */
  avgOwnDelta: number | null;
  verdict: RelativeVerdict;
}

/**
 * 硬度的分解。
 *
 * ⚠️ 为什么不能只看 B50 里的硬谱占比：
 *    B50 的定义就是「打得最好的 50 首」，而诈称谱**难打** → 天然进不了 B50
 *    → 该占比对所有人恒低，维度零区分度。
 *
 * 因此**评分只用「硬谱上的实际表现」**：把 B50 内外的硬谱合并、按谱面归并取最高成就，
 * 看它们相对本人 B50 平均达成率差多少。
 *
 * ⚠️ 2026-09-20 修正 —— 三个曾把分数抬到虚高的坑：
 *   1. **未控制定数**：B50 之外的低定数硬谱（如 ADV 8.0）达成率天然接近 100%，
 *      混进来会把 Δ 拉得虚高。→ 新增 `comparableMinConstant` 门槛。
 *   2. **选择偏差**：原先只取「达成率最高的 8 张」，本身就是挑最好的看。
 *      → 改为用池内**全部**可比硬谱。
 *   3. **映射区间过宽**：原先 `mapRange(Δ, −8, 0)`，而 Δ 是百分点差、实际在 ±1.5 量级，
 *      于是 Δ≈0（几乎必然发生）就能拿 99 分。→ 区间改为 −2.0 → 0。
 *
 * `b50HardRate` 仅作**描述性信息**展示（告诉用户 B50 成分里有多少硬货），不参与评分 ——
 * 因为占比低是「硬谱难打」的必然结果，不是玩家的短板。
 */
export interface HardnessBreakdown {
  /** 参与评分的硬谱数（B50 内外合并、按谱面归并、已过定数门槛） */
  hardCount: number;
  /** 因定数与 B50 不可比而被排除的硬谱数（低定数硬谱会污染 Δ） */
  excludedByConstant: number;
  /** 参与评分的可比定数下限（= B50 最低定数 − 容忍值） */
  comparableMinConstant: number;

  /** ── 以下三项为描述性信息，不参与评分 ── */
  /** 其中落在 B50 里的张数 */
  b50HardCount: number;
  /** B50 中有判定依据（社区标注或统计口径）的谱面数 */
  b50RatedCount: number;
  /** B50 内硬谱占比 */
  b50HardRate: number;

  /** ── 以下三项参与评分 ── */
  /** 参与评分的硬谱平均达成率 */
  sampleAvgAchievement: number | null;
  /** 参与评分的硬谱平均达成率 − 本人 B50 平均达成率。≥0 = 硬谱上并不吃亏 */
  hardDelta: number | null;
  /** 参与评分的硬谱明细（按达成率降序），供 UI 展示与 AI 引用 */
  samples: TypeChartRef[];
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
  /** 类型专项表现（DXRating 评价组，按 chartCount 降序） */
  typeSpecialties: TypeSpecialty[];
  /** 打谱偏向 —— tag 两两组合的相对表现（按 avgOwnDelta 降序，强的在前） */
  typeCombos: TypeCombo[];
  /** 曲风口味（官方 genre，按 chartCount 降序；只描述兴趣，不评强弱） */
  genreTastes: GenreTaste[];
  /** 硬度口径分解 */
  hardness: HardnessBreakdown;
  /** 所有谱面明细（按贡献降序） */
  charts: ChartAnalysis[];
  /** 一句话总评（规则生成，不依赖 AI） */
  headline: string;
}
