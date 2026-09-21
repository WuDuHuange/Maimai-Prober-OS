/**
 * B50 维度分析算法（纯函数，可独立测试）
 *
 * ## 基准说明（重要）
 * `peer_stats`（OneCatBot 同段聚合）当前 502 不可用 → 本实现**不做任何跨玩家强弱对比**。
 *
 * 为什么不退而求其次用「水鱼全服平均达成率」做基准？实测：
 * 全服 `avg` 把大量低水平玩家算进去，15.0 谱的全服平均只有 **82.8%**，
 * 而正常 B50 里这张谱是 96%+ —— `我的达成率 − 全服平均` 恒为正十几，**完全无意义**。
 * 因此 `peerStatsAvailable` 恒为 `false`，**禁止同段/全服比较断言**（符合规格 §4.1 硬约束）。
 *
 * 替代方案：
 * - **谱面属性**用全服统计：`水度 = ds − fit_diff`、`std_dev`、`cnt` —— 与玩家无关，可用 ✅
 * - **个人强弱**用 **B50 内部对比**：`ownDelta = 该谱达成率 − 我的 B50 平均达成率` ✅
 *
 * ## 六维定义（全部 0–100，越高越好）
 * | id | 名称 | 口径 | 映射区间 |
 * |---|---|---|---|
 * | power | 底力 | B50 平均定数 | 11.0 → 15.0 |
 * | precision | 精度 | B50 平均达成率 | 97.5 → 100.2 |
 * | consistency | 稳定 | B50 内达成率标准差（逆向） | 1.4 → 0.3 |
 * | balance | 专项均衡 | 各技术类型中**最弱一类**的 ownDelta | −1.2 → +0.2 |
 * | hardness | 硬度 | 混合口径：B50 内硬谱占比 + 全成绩硬谱表现 | 见 HardnessBreakdown |
 * | adaptation | 版本适应 | B15 平均定数 ÷ B35 平均定数 | 0.97 → 1.03 |
 */
import type { B50Record } from '@/types/b50';
import type { PlayRecord } from '@/types/playRecord';
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';
import type { TagCatalog } from '@/types/tag';
import { DIFFICULTY_INDEX, TAG_IDS, TAG_GROUP_IDS, EVALUATION_TAG_ORDER, chartTagKey } from '@/types/tag';
import type { ChartStatsPayload } from '@/services/chartStatsApi';
import { getChartStat } from '@/services/chartStatsApi';
import type {
  AbilityDimension,
  AnalysisHighlights,
  B50AnalysisResult,
  B50Structure,
  ChartAnalysis,
  GenreTaste,
  HardnessBreakdown,
  RelativeVerdict,
  TagPerformance,
  TypeChartRef,
  TypeCombo,
  TypeSpecialty,
  WaterBaseline,
} from '@/types/b50Analysis';

// ---- 小工具 ----

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 线性映射到 0–100 并截断。lo > hi 时自动反向（用于「越小越好」的指标）。 */
function mapRange(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50;
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
}

function round(v: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

// ---- 水度自校准基准 ----

/**
 * 按难度计算「水度」的均值与标准差。
 *
 * 为什么需要：`水度 = ds − fit_diff` 存在**系统性难度偏差**
 * （Basic 平均水度 −0.21，92.3% 被判「偏难」），直接用绝对阈值会误判。
 * 用分难度 z-score 自校准后，阈值才有可比性。
 */
export function computeWaterBaseline(payload: ChartStatsPayload | null): Map<number, WaterBaseline> {
  const buckets = new Map<number, number[]>();
  if (!payload?.charts) return new Map();

  for (const songId of Object.keys(payload.charts)) {
    const arr = payload.charts[songId];
    if (!Array.isArray(arr)) continue;
    for (let li = 0; li < arr.length; li++) {
      const s = arr[li];
      if (!s || typeof s.fit_diff !== 'number') continue;
      // 用 diff 字符串解析官方定数（如 "13+" → 13.7）
      const ds = parseLevelToConstant(s.diff);
      if (ds == null) continue;
      const water = ds - s.fit_diff;
      const b = buckets.get(li);
      if (b) b.push(water);
      else buckets.set(li, [water]);
    }
  }

  const out = new Map<number, WaterBaseline>();
  for (const [li, values] of buckets) {
    out.set(li, { mean: mean(values), std: stdDev(values), count: values.length });
  }
  return out;
}

/**
 * 水鱼 `diff` 是等级字符串（"13" / "13+" / "12.8"），不是 level_index。
 * 解析成数值：`13+` → 13.7，`13-` → 13.3，`13` → 13.0
 */
export function parseLevelToConstant(diff: string | undefined): number | null {
  if (!diff) return null;
  const m = String(diff).trim().match(/^(\d+(?:\.\d+)?)([+\-?])?$/);
  if (!m) return null;
  const base = Number(m[1]);
  if (Number.isNaN(base)) return null;
  if (m[2] === '+') return base + 0.7;
  if (m[2] === '-') return base - 0.3;
  return base;
}

// ---- 主入口 ----

export interface AnalyzeB50Input {
  /** 已按谱面归并的 B50 列表（务必先过 collapseByChart / loadFromDB 的去重） */
  b50List: B50Record[];
  songMap: Map<number, SongMeta>;
  tagCatalog: TagCatalog | null;
  statsPayload: ChartStatsPayload | null;
  playerRating: number;
  playerName: string;
  /**
   * 全量游玩记录（含历史重复行）。
   * 用途：**硬度**维度需要看 B50 之外的硬谱表现 ——
   * 因为 B50 只收「打得最好的 50 首」，硬谱天然被挤出，只看 B50 会让该维度零区分度。
   * 省略或传空数组时，硬度退化为「只看 B50 内占比」的旧口径。
   */
  allPlays?: PlayRecord[];
}

/** 类型/曲风相对表现的判定阈值（基于 ownDelta，B50 内部对比） */
const VERDICT_STRONG = 0.3;
const VERDICT_WEAK = -0.3;
/** 一个类型至少要有这么多谱面才敢下判定 */
const MIN_CHARTS_FOR_VERDICT = 3;

/**
 * 小样本收缩常数（James-Stein 风格）。
 *
 * 为什么需要：星星谱在 DXRating 里只有 284 个标注，一个玩家 B50 里可能只命中 3 张。
 * 3 张谱的平均 ownDelta 波动极大，**一个偶然的低分就能把「专项均衡」整维打到 0 分**。
 * 收缩 `Δ' = Δ × n / (n + K)` 让观测值向 0 靠：n=3 时只信 43%，n=25 时信 86%。
 *
 * ⚠️ `verdict` 用**原始 Δ**（给用户看观测事实），「专项均衡」维度用**收缩 Δ**（稳健推断）。
 */
const SHRINK_K = 4;

function shrink(delta: number, n: number): number {
  return delta * (n / (n + SHRINK_K));
}

/**
 * 硬谱定数门槛的容忍值：硬谱定数必须 ≥ B50 最低定数 − 该值，否则视为不可比。
 *
 * ⚠️ 不加这道门槛，B50 之外的低定数硬谱（ADV 8.0 之类）会混进来 ——
 * 它们的达成率天然接近 100%，会把 hardDelta 拉得虚高，
 * 进而让「硬度」维度虚高（曾出现 Δ≈0 → 99 分）。
 */
const HARD_CONST_MARGIN = 0.5;

function verdictOf(ownDelta: number | null, count: number): RelativeVerdict {
  if (count < MIN_CHARTS_FOR_VERDICT || ownDelta == null) return 'insufficient';
  if (ownDelta >= VERDICT_STRONG) return 'strong';
  if (ownDelta <= VERDICT_WEAK) return 'weak';
  return 'neutral';
}

function toRef(c: ChartAnalysis): TypeChartRef {
  return {
    songId: c.songId,
    title: c.title,
    difficulty: c.difficulty,
    constant: c.constant,
    achievements: c.achievements,
    ownDelta: c.ownDelta,
  };
}

export function analyzeB50(input: AnalyzeB50Input): B50AnalysisResult {
  const { b50List, songMap, tagCatalog, statsPayload, playerRating, playerName } = input;
  const allPlays = input.allPlays ?? [];

  const waterBaseline = computeWaterBaseline(statsPayload);

  // 第一遍：构造单谱面明细（此时还不知道 B50 自身平均，ownDelta 先留空）
  const charts: ChartAnalysis[] = b50List.map(rec =>
    buildChartAnalysis(rec, songMap, tagCatalog, statsPayload, waterBaseline)
  );

  // B50 自身平均达成率 —— 用作「个人内部对比」的基准
  const ownAvg = mean(charts.map(c => c.achievements));
  for (const c of charts) {
    c.ownDelta = round(c.achievements - ownAvg, 3);
  }

  const structure = buildStructure(charts, ownAvg);
  const typeSpecialties = buildTypeSpecialties(charts, tagCatalog);
  const tagPerformance = buildTagPerformance(charts, tagCatalog);
  const typeCombos = buildTypeCombos(charts, tagCatalog);
  const genreTastes = buildGenreTastes(charts, songMap);
  const hardness = buildHardness(charts, allPlays, songMap, tagCatalog, statsPayload, waterBaseline, ownAvg);
  const dimensions = buildDimensions(structure, typeSpecialties, hardness);
  const highlights = buildHighlights(charts);
  const matched = charts.filter(c => c.stat !== null).length;

  return {
    generatedAt: new Date().toISOString(),
    playerRating,
    playerName,
    // peer_stats 分发地址 502 → 恒为 false，禁用一切跨玩家比较断言
    peerStatsAvailable: false,
    baseline: matched > 0 ? 'chart_stats' : 'none',
    baselineCoverage: { matched, total: charts.length },
    tagAvailable: !!tagCatalog && charts.some(c => c.tags.length > 0),
    dimensions,
    structure,
    highlights,
    typeSpecialties,
    typeCombos,
    tagPerformance,
    genreTastes,
    hardness,
    charts,
    headline: buildHeadline(dimensions, structure, highlights, typeSpecialties),
  };
}

// ---- 单谱面 ----

function buildChartAnalysis(
  rec: B50Record,
  songMap: Map<number, SongMeta>,
  tagCatalog: TagCatalog | null,
  statsPayload: ChartStatsPayload | null,
  waterBaseline: Map<number, WaterBaseline>
): ChartAnalysis {
  const song = songMap.get(rec.songId);
  const difficulty = rec.difficulty as DifficultyType;
  const levelIndex = DIFFICULTY_INDEX[difficulty] ?? -1;
  const constant = song ? getConstByDifficulty(song, difficulty) : (rec.constant ?? null);

  const tags = tagCatalog?.byChart.get(chartTagKey(rec.songId, difficulty)) ?? [];

  const rawStat = statsPayload && levelIndex >= 0 ? getChartStat(statsPayload, rec.songId, levelIndex) : null;
  const stat = rawStat
    ? { cnt: rawStat.cnt, fitDiff: rawStat.fit_diff, avg: rawStat.avg, stdDev: rawStat.std_dev }
    : null;

  // 水度：官方定数 − 拟合定数。正值 = 比官标容易
  const waterIndex = stat && constant != null ? round(constant - stat.fitDiff, 3) : null;

  // 水度 z-score（按难度自校准）
  let waterZ: number | null = null;
  if (waterIndex != null && levelIndex >= 0) {
    const b = waterBaseline.get(levelIndex);
    if (b && b.std > 1e-6) waterZ = round((waterIndex - b.mean) / b.std, 3);
  }

  return {
    songId: rec.songId,
    title: rec.title ?? song?.title ?? `#${rec.songId}`,
    type: (rec.type ?? song?.type ?? 'SD') as 'DX' | 'SD',
    difficulty,
    levelIndex,
    constant,
    achievements: round(rec.achievements, 4),
    ratingContribution: Math.round(rec.ratingContribution ?? 0),
    isNew: !!rec.isNew,
    fcStatus: rec.fcStatus,
    tags,
    tagNames: tags.map(t => t.name),
    hasWaterTag: tags.some(t => t.id === TAG_IDS.OVERRATED),
    hasUnderratedTag: tags.some(t => t.id === TAG_IDS.UNDERRATED),
    stat,
    waterIndex,
    waterZ,
    /** 统计口径判定：z ≥ +1.5 视为偏水，≤ −1.5 视为偏硬 */
    isWaterByStat: waterZ != null && waterZ >= 1.5,
    isHardByStat: waterZ != null && waterZ <= -1.5,
    ownDelta: 0, // 由 analyzeB50 第二遍填充
  };
}

// ---- B50 结构 ----

function buildStructure(charts: ChartAnalysis[], ownAvg: number): B50Structure {
  const consts = charts.map(c => c.constant).filter((c): c is number => c != null);
  const b15 = charts.filter(c => c.isNew);
  const b35 = charts.filter(c => !c.isNew);
  const constsOf = (arr: ChartAnalysis[]) => arr.map(c => c.constant).filter((c): c is number => c != null);

  const byDifficulty: Record<string, number> = {};
  for (const c of charts) byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] ?? 0) + 1;

  const hist = new Map<number, number>();
  for (const c of consts) {
    const bucket = Math.floor(c);
    hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
  }
  const constHistogram = [...hist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, count]) => ({ label: `${b}.0–${b}.9`, count }));

  return {
    totalRating: Math.round(charts.reduce((s, c) => s + c.ratingContribution, 0)),
    b15Count: b15.length,
    b35Count: b35.length,
    b15AvgConst: round(mean(constsOf(b15)), 3),
    b35AvgConst: round(mean(constsOf(b35)), 3),
    avgConstant: round(mean(consts), 3),
    maxConstant: consts.length ? round(Math.max(...consts), 1) : 0,
    avgAchievement: round(ownAvg, 4),
    achievementStdDev: round(stdDev(charts.map(c => c.achievements)), 4),
    countBird: charts.filter(c => c.achievements >= 100).length,
    countBirdPlus: charts.filter(c => c.achievements >= 100.5).length,
    byDifficulty,
    constHistogram,
  };
}

// ---- 六维 ----

function buildDimensions(
  structure: B50Structure,
  typeSpecialties: TypeSpecialty[],
  hardness: HardnessBreakdown
): AbilityDimension[] {
  const dims: AbilityDimension[] = [];

  // 1) 底力
  dims.push({
    id: 'power',
    label: '底力',
    score: Math.round(mapRange(structure.avgConstant, 11.0, 15.0)),
    raw: structure.avgConstant,
    rawLabel: `平均定数 ${structure.avgConstant.toFixed(2)}`,
    basis: 'B50 全部谱面的官方定数平均值，映射区间 11.0 → 15.0',
  });

  // 2) 精度
  dims.push({
    id: 'precision',
    label: '精度',
    score: Math.round(mapRange(structure.avgAchievement, 97.5, 100.2)),
    raw: structure.avgAchievement,
    rawLabel: `平均达成率 ${structure.avgAchievement.toFixed(2)}%`,
    basis: 'B50 平均达成率，映射区间 97.5% → 100.2%',
  });

  // 3) 稳定 —— lo > hi 自动反向：标准差越小分越高
  dims.push({
    id: 'consistency',
    label: '稳定',
    score: Math.round(mapRange(structure.achievementStdDev, 1.4, 0.3)),
    raw: structure.achievementStdDev,
    rawLabel: `达成率标准差 ${structure.achievementStdDev.toFixed(2)}`,
    basis: 'B50 内达成率标准差（越小越稳），映射区间 1.4 → 0.3',
  });

  // 4) 专项均衡 —— 木桶原理：取各技术类型里**最弱**那一类的 ownDelta
  //    （原「广度」用配置组 14 个 tag 的香农熵，样本量敏感 + 不可操作 + 与底力共线，已废弃）
  //    用收缩后的 Δ 判定，避免 3 张样本的偶然低分主导整维
  const ratedTypes = typeSpecialties.filter(t => t.verdict !== 'insufficient' && t.avgOwnDelta != null);
  const shrunk = ratedTypes.map(t => ({ t, d: shrink(t.avgOwnDelta!, t.chartCount) }));
  if (shrunk.length < 2) {
    dims.push({
      id: 'balance', label: '专项均衡', score: 50, raw: 0,
      rawLabel: `可比类型仅 ${shrunk.length} 类`,
      basis: '各技术类型（星星谱/键盘谱/体力谱/底力谱/高物量）中最弱一类的相对表现 —— 社区标注覆盖不足，取中性值 50',
      insufficient: true,
    });
  } else {
    const worst = shrunk.reduce((a, b) => (a.d <= b.d ? a : b));
    dims.push({
      id: 'balance',
      label: '专项均衡',
      score: Math.round(mapRange(worst.d, -1.0, 0.2)),
      raw: round(worst.t.avgOwnDelta!, 3),
      rawLabel:
        `最弱「${worst.t.name}」Δ${worst.t.avgOwnDelta! >= 0 ? '+' : ''}${worst.t.avgOwnDelta!.toFixed(2)}` +
        `（${worst.t.chartCount} 张，收缩后 ${worst.d >= 0 ? '+' : ''}${worst.d.toFixed(2)}；${shrunk.length} 类可比）`,
      basis:
        `B50 命中的 ${shrunk.length} 个技术类型中，最弱一类的 ownDelta（相对本人 B50 平均达成率），` +
        `映射区间 −1.0 → +0.2。分数越高 = 各类型越均衡，短板越不拖后腿。` +
        `⚠️ 已对小样本类型做收缩（Δ × n/(n+${SHRINK_K})），避免只有两三张谱的类型靠偶然波动主导整维。`,
    });
  }

  // 5) 硬度 —— 混合口径（B50 内占比 + 全成绩硬谱表现）
  dims.push(buildHardnessDimension(hardness));

  // 6) 版本适应
  if (structure.b15Count < 3 || structure.b35AvgConst <= 0) {
    dims.push({
      id: 'adaptation', label: '版本适应', score: 50, raw: 0,
      rawLabel: `B15 仅 ${structure.b15Count} 条`,
      basis: 'B15 相对 B35 的定数强度比 —— 新曲样本不足，取中性值 50',
      insufficient: true,
    });
  } else {
    const ratio = structure.b15AvgConst / structure.b35AvgConst;
    dims.push({
      id: 'adaptation',
      label: '版本适应',
      score: Math.round(mapRange(ratio, 0.97, 1.03)),
      raw: round(ratio, 4),
      rawLabel: `B15 ${structure.b15AvgConst.toFixed(2)} ÷ B35 ${structure.b35AvgConst.toFixed(2)} = ${ratio.toFixed(3)}`,
      basis: 'B15（新曲）平均定数 ÷ B35（旧曲）平均定数，映射区间 0.97 → 1.03',
    });
  }

  return dims;
}

/**
 * 硬度维度。
 *
 * 口径：**只看硬谱上的实际表现** —— B50 内外的硬谱合并后取达成率最高的若干张，
 * 与本人 B50 平均达成率作差。差得少说明硬谱上并不吃亏。
 *
 * 为什么不把「B50 内硬谱占比」算进分数：B50 只收打得最好的 50 首，
 * 而诈称谱难打 → 天然被挤出 → 占比低是**必然结果**，不是玩家短板。
 * 该占比只在 rawLabel 里作为描述信息出现。
 */
function buildHardnessDimension(h: HardnessBreakdown): AbilityDimension {
  if (h.hardDelta == null) {
    return {
      id: 'hardness', label: '硬度', score: 50, raw: 0,
      rawLabel: `可比硬谱不足（B50 内 ${h.b50HardCount}/${h.b50RatedCount}）`,
      basis:
        '硬谱上的相对表现 —— 与 B50 定数可比的硬谱不足 3 张，样本波动过大，取中性值 50。' +
        '通常是社区标注覆盖不足、统计基准不可用，或 B50 定数区间内确实没有硬谱。',
      insufficient: true,
    };
  }

  return {
    id: 'hardness',
    label: '硬度',
    score: Math.round(mapRange(h.hardDelta, -2.0, 0)),
    raw: round(h.hardDelta, 3),
    rawLabel:
      `可比硬谱 ${h.hardCount} 张（B50 内 ${h.b50HardCount}）· 平均 ` +
      `${h.sampleAvgAchievement?.toFixed(2) ?? '?'}%（Δ${h.hardDelta >= 0 ? '+' : ''}${h.hardDelta.toFixed(2)}）`,
    basis:
      '硬谱（社区标「诈称谱」或统计口径水度 z ≤ −1.5）上的实际表现：' +
      '把 B50 内外的硬谱合并、按谱面取最高成就，' +
      `**只保留定数 ≥ ${h.comparableMinConstant}（与 B50 可比）的**，` +
      '算它们平均达成率相对本人 B50 平均达成率的差，映射区间 −2.0 → 0。' +
      '⚠️ 两点口径说明：① B50 内硬谱占比**不计入分数**（硬谱难打天然被挤出，占比低是必然结果）；' +
      '② 低定数硬谱（如 ADV 8.0）达成率天然接近 100%，已按定数门槛排除' +
      `${h.excludedByConstant > 0 ? `（本次排除 ${h.excludedByConstant} 张）` : ''}，否则 Δ 会虚高。`,
  };
}

/**
 * 类型专项 —— 基于 DXRating「评价」组 tag。
 * 动态按 `groupId === EVALUATION` 过滤，DXRating 将来新增评价 tag 会自动纳入。
 */
function buildTypeSpecialties(
  charts: ChartAnalysis[],
  tagCatalog: TagCatalog | null
): TypeSpecialty[] {
  const evalTags = (tagCatalog?.tags ?? []).filter(t => t.groupId === TAG_GROUP_IDS.EVALUATION);
  if (evalTags.length === 0) return [];

  const out: TypeSpecialty[] = evalTags.map(tag => {
    const matched = charts.filter(c => c.tags.some(t => t.id === tag.id));
    const avgOwnDelta = matched.length ? round(mean(matched.map(c => c.ownDelta)), 3) : null;
    const avgAchievement = matched.length ? round(mean(matched.map(c => c.achievements)), 3) : null;

    let bestChart: TypeChartRef | null = null;
    let worstChart: TypeChartRef | null = null;
    if (matched.length) {
      const sorted = [...matched].sort((a, b) => b.ownDelta - a.ownDelta);
      bestChart = toRef(sorted[0]);
      worstChart = toRef(sorted[sorted.length - 1]);
    }

    return {
      tagId: tag.id,
      name: tag.name,
      description: tag.description,
      chartCount: matched.length,
      avgAchievement,
      avgOwnDelta,
      verdict: verdictOf(avgOwnDelta, matched.length),
      bestChart,
      worstChart,
    };
  });

  // 预设顺序优先，未列出的排最后；同序按命中数降序
  const orderIndex = (id: number) => {
    const i = EVALUATION_TAG_ORDER.indexOf(id);
    return i < 0 ? EVALUATION_TAG_ORDER.length : i;
  };
  return out.sort((a, b) => orderIndex(a.tagId) - orderIndex(b.tagId) || b.chartCount - a.chartCount);
}

/**
 * 曲风口味 —— 官方 genre 字段，按张数降序。
 *
 * ⚠️ 只描述**兴趣结构**，不做任何强弱判定（2026-09-20 修正）：
 *    口味回答的是「我喜欢打什么」，与水平无关。
 *    原先带 `verdict` / `avgOwnDelta`，等于把口味分析做成了能力分析，是错的。
 */
function buildGenreTastes(
  charts: ChartAnalysis[],
  songMap: Map<number, SongMeta>
): GenreTaste[] {
  const buckets = new Map<string, ChartAnalysis[]>();
  for (const c of charts) {
    const genre = songMap.get(c.songId)?.genre?.trim();
    if (!genre) continue;
    const arr = buckets.get(genre);
    if (arr) arr.push(c);
    else buckets.set(genre, [c]);
  }

  const total = charts.length || 1;
  return [...buckets.entries()]
    .map(([genre, arr]): GenreTaste => {
      const consts = arr
        .map(c => c.constant)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      return {
        genre,
        chartCount: arr.length,
        share: round(arr.length / total, 4),
        avgAchievement: round(mean(arr.map(c => c.achievements)), 3),
        avgConstant: consts.length ? round(mean(consts), 2) : null,
      };
    })
    .sort((a, b) => b.chartCount - a.chartCount);
}

/** 组合分析的最小样本量 —— 组合的样本天然比单 tag 小，门槛不够会被偶然波动主导 */
const MIN_CHARTS_FOR_COMBO = 3;

/**
 * 单 tag 的相对表现 —— 覆盖**配置组 + 评价组**全部 tag。
 *
 * 存在的理由：`typeSpecialties` 只回答「评价组那 5 类怎么样」，
 * 而玩家真正会问的是「我打得最差的那个 tag 到底是哪个」——
 * 答案经常在**配置组**里（错位 / 交互 / 爆发 / 绝赞段 …）。
 *
 * ⚠️ 必须与 `buildTypeCombos` **成对使用**：单项说明「哪一类谱本身不顺」，
 *    组合说明「哪些干扰源叠加后才崩」。只看组合会把组合效应误读成单项短板。
 */
function buildTagPerformance(
  charts: ChartAnalysis[],
  tagCatalog: TagCatalog | null
): TagPerformance[] {
  if (!tagCatalog) return [];

  const out: TagPerformance[] = [];
  for (const tag of tagCatalog.tags) {
    const group: TagPerformance['group'] | null =
      tag.groupId === TAG_GROUP_IDS.CONFIG ? 'config'
        : tag.groupId === TAG_GROUP_IDS.EVALUATION ? 'evaluation'
          : null;
    // 难度组（水 / 诈称谱）不参与 —— 它们已由「谱面性质」与「硬度」单独分析
    if (!group) continue;

    const matched = charts.filter(c => c.tags.some(t => t.id === tag.id));
    if (matched.length < MIN_CHARTS_FOR_VERDICT) continue;

    const consts = matched
      .map(c => c.constant)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgOwnDelta = round(mean(matched.map(c => c.ownDelta)), 3);

    out.push({
      tagId: tag.id,
      name: tag.name,
      group,
      chartCount: matched.length,
      avgAchievement: round(mean(matched.map(c => c.achievements)), 3),
      avgConstant: consts.length ? round(mean(consts), 2) : null,
      avgOwnDelta,
      verdict: verdictOf(avgOwnDelta, matched.length),
    });
  }

  // 强的在前（UI / 快照都取两端）
  return out.sort((a, b) => (b.avgOwnDelta ?? 0) - (a.avgOwnDelta ?? 0));
}

/**
 * 打谱偏向 —— tag **两两组合**的相对表现。
 *
 * 回答「哪些 tag 组合的歌打得好、哪些不行」，与「技术类型专项」（单 tag）互补：
 * 单 tag 看不出组合效应 —— 「星星谱」可能整体持平，但「星星谱 + 交互」明显偏低。
 *
 * 参与组合的 tag 只取**配置组 + 评价组**；难度组（水 / 诈称谱）已由
 * 「谱面性质」与「硬度」单独分析，混进来只会稀释信号。
 */
function buildTypeCombos(
  charts: ChartAnalysis[],
  tagCatalog: TagCatalog | null
): TypeCombo[] {
  if (!tagCatalog) return [];

  const comboable = new Set(
    tagCatalog.tags
      .filter(t => t.groupId === TAG_GROUP_IDS.CONFIG || t.groupId === TAG_GROUP_IDS.EVALUATION)
      .map(t => t.id)
  );
  if (comboable.size < 2) return [];

  const nameOf = new Map(tagCatalog.tags.map(t => [t.id, t.name] as const));

  /** key = `${idA}|${idB}`（升序） */
  const buckets = new Map<string, { ids: [number, number]; hits: ChartAnalysis[] }>();

  for (const c of charts) {
    const ids = [...new Set(c.tags.map(t => t.id).filter(id => comboable.has(id)))]
      .sort((a, b) => a - b);
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        const hit = buckets.get(key);
        if (hit) hit.hits.push(c);
        else buckets.set(key, { ids: [ids[i], ids[j]], hits: [c] });
      }
    }
  }

  const out: TypeCombo[] = [];
  for (const { ids, hits } of buckets.values()) {
    if (hits.length < MIN_CHARTS_FOR_COMBO) continue;
    const avgOwnDelta = round(mean(hits.map(c => c.ownDelta)), 3);
    out.push({
      tagIds: ids,
      label: `${nameOf.get(ids[0]) ?? `#${ids[0]}`} + ${nameOf.get(ids[1]) ?? `#${ids[1]}`}`,
      chartCount: hits.length,
      avgAchievement: round(mean(hits.map(c => c.achievements)), 3),
      avgOwnDelta,
      verdict: verdictOf(avgOwnDelta, hits.length),
    });
  }

  // 强的在前（UI 取两端展示）
  return out.sort((a, b) => (b.avgOwnDelta ?? 0) - (a.avgOwnDelta ?? 0));
}

/**
 * 硬度取数。
 *
 * 把 **B50 内外的硬谱合并**（按谱面归并，B50 的谱面不重复计入），
 * 取达成率最高的若干张，与本人 B50 平均达成率作差。
 *
 * 判定「硬谱」的两个口径（满足其一即可）：
 *   a) 社区标注「诈称谱」
 *   b) 统计口径：水度分难度 z-score ≤ −1.5
 */
function buildHardness(
  charts: ChartAnalysis[],
  allPlays: PlayRecord[],
  songMap: Map<number, SongMeta>,
  tagCatalog: TagCatalog | null,
  statsPayload: ChartStatsPayload | null,
  waterBaseline: Map<number, WaterBaseline>,
  ownAvg: number
): HardnessBreakdown {
  // ── 描述性：B50 内硬谱（不参与评分，见 HardnessBreakdown 注释） ──
  const b50Rated = charts.filter(c => c.tags.length > 0 || c.waterZ != null);
  const b50Hard = b50Rated.filter(c => c.hasUnderratedTag || c.isHardByStat);

  // ── 可比定数下限（⚠️ 关键门槛）──
  // B50 之外的低定数硬谱（ADV 8.0 之类）达成率天然接近 100%，
  // 混进来会把 hardDelta 拉得虚高 → 硬度虚高。必须限定「与 B50 可比」。
  const b50Consts = charts
    .map(c => c.constant)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const b50MinConst = b50Consts.length ? Math.min(...b50Consts) : 0;
  const comparableMin = b50MinConst > 0 ? round(b50MinConst - HARD_CONST_MARGIN, 2) : 0;

  /** 定数是否与 B50 可比。拿不到定数的硬谱一律排除（宁缺毋滥）。 */
  const isComparable = (constant: number | null): boolean => {
    if (comparableMin <= 0) return true; // B50 定数未知 → 不设门槛
    return constant != null && constant >= comparableMin;
  };

  // ── 评分口径：B50 内硬谱先入池（它们的定数天然与 B50 可比） ──
  const hardRefs: TypeChartRef[] = b50Hard.map(toRef);
  let excludedByConstant = 0;

  // ── 再把 B50 之外、定数可比的硬谱补进来（同一谱面只留最高达成率那一条） ──
  const bestByChart = new Map<string, PlayRecord>();
  for (const p of allPlays) {
    const key = chartTagKey(p.songId, p.difficulty);
    const prev = bestByChart.get(key);
    if (!prev || p.achievements > prev.achievements) bestByChart.set(key, p);
  }

  const inB50 = new Set(charts.map(c => chartTagKey(c.songId, c.difficulty)));

  for (const [key, p] of bestByChart) {
    if (inB50.has(key)) continue;

    const byTag = (tagCatalog?.byChart.get(key) ?? []).some(t => t.id === TAG_IDS.UNDERRATED);

    const song = songMap.get(p.songId);
    const constant = song
      ? getConstByDifficulty(song, p.difficulty)
      : (typeof p.constant === 'number' ? p.constant : null);

    let byStat = false;
    const levelIndex = DIFFICULTY_INDEX[p.difficulty];
    if (!byTag && statsPayload && levelIndex != null) {
      const raw = getChartStat(statsPayload, p.songId, levelIndex);
      if (raw && constant != null) {
        const baseline = waterBaseline.get(levelIndex);
        if (baseline && baseline.std > 1e-6) {
          const z = (constant - raw.fit_diff - baseline.mean) / baseline.std;
          byStat = z <= -1.5;
        }
      }
    }

    if (!byTag && !byStat) continue;

    // ⚠️ 定数门槛：低定数硬谱达成率天然高，会污染 Δ
    if (!isComparable(constant)) {
      excludedByConstant += 1;
      continue;
    }

    hardRefs.push({
      songId: p.songId,
      title: song?.title ?? `#${p.songId}`,
      difficulty: p.difficulty,
      constant,
      achievements: round(p.achievements, 3),
      ownDelta: round(p.achievements - ownAvg, 3),
    });
  }

  // ⚠️ 全部可比硬谱参与评分 —— **不再截断**（原先取达成率最高的 8 张是选择偏差）
  hardRefs.sort((a, b) => b.achievements - a.achievements);

  // 样本太少时不硬给结论（3 张以下的平均波动过大）
  const enough = hardRefs.length >= MIN_CHARTS_FOR_VERDICT;
  const sampleAvgAchievement = enough ? round(mean(hardRefs.map(s => s.achievements)), 3) : null;
  const hardDelta = sampleAvgAchievement != null
    ? round(sampleAvgAchievement - ownAvg, 3)
    : null;

  return {
    hardCount: hardRefs.length,
    excludedByConstant,
    comparableMinConstant: comparableMin,
    b50HardCount: b50Hard.length,
    b50RatedCount: b50Rated.length,
    b50HardRate: round(b50Rated.length > 0 ? b50Hard.length / b50Rated.length : 0, 4),
    sampleAvgAchievement,
    hardDelta,
    samples: hardRefs,
  };
}

// ---- 亮点与风险 ----

function buildHighlights(charts: ChartAnalysis[]): AnalysisHighlights {
  const byContribution = (a: ChartAnalysis, b: ChartAnalysis) => b.ratingContribution - a.ratingContribution;

  return {
    // 水分谱：社区标「水」或统计口径偏水（z ≥ +1.5）
    waterCharts: charts
      .filter(c => c.hasWaterTag || c.isWaterByStat)
      .sort(byContribution),
    // 硬谱：社区标「诈称谱」或统计口径偏硬
    underratedCharts: charts
      .filter(c => c.hasUnderratedTag || c.isHardByStat)
      .sort(byContribution),
    // ⚠️ 以下两个是「B50 内部对比」，不是跨玩家对比
    weakCharts: charts
      .filter(c => c.ownDelta <= -0.5)
      .sort((a, b) => a.ownDelta - b.ownDelta),
    strongCharts: charts
      .filter(c => c.ownDelta >= 0.5)
      .sort((a, b) => b.ownDelta - a.ownDelta),
  };
}

// ---- 总评（规则生成，离线也能给结论）----

function buildHeadline(
  dims: AbilityDimension[],
  structure: B50Structure,
  highlights: AnalysisHighlights,
  typeSpecialties: TypeSpecialty[]
): string {
  const valid = dims.filter(d => !d.insufficient);
  const strongest = [...valid].sort((a, b) => b.score - a.score)[0];
  const weakest = [...valid].sort((a, b) => a.score - b.score)[0];

  const parts: string[] = [];

  parts.push(
    `B50 总 Rating ${structure.totalRating}，平均定数 ${structure.avgConstant.toFixed(2)}，` +
    `平均达成率 ${structure.avgAchievement.toFixed(2)}%。`
  );

  if (strongest && weakest && strongest.id !== weakest.id) {
    parts.push(`六维中「${strongest.label}」最突出（${strongest.score}），「${weakest.label}」相对最弱（${weakest.score}）。`);
  }

  // 最弱技术类型 —— 这是最可操作的一条信息，优先于泛泛的维度描述
  const ratedTypes = typeSpecialties.filter(t => t.verdict !== 'insufficient');
  const weakTypes = ratedTypes.filter(t => t.verdict === 'weak').sort(
    (a, b) => (a.avgOwnDelta ?? 0) - (b.avgOwnDelta ?? 0)
  );
  if (weakTypes.length > 0) {
    const w = weakTypes[0];
    parts.push(
      `技术类型里「${w.name}」是短板（${w.chartCount} 张，相对自身平均 ${w.avgOwnDelta! >= 0 ? '+' : ''}${w.avgOwnDelta!.toFixed(2)}%）。`
    );
  } else if (ratedTypes.length > 0) {
    parts.push(`技术类型分布较均衡，${ratedTypes.length} 类谱面都没有明显短板。`);
  }

  const water = highlights.waterCharts.length;
  const hard = highlights.underratedCharts.length;
  if (water > 0 || hard > 0) {
    parts.push(`B50 中有 ${water} 张偏「水」、${hard} 张偏「硬」（社区标注 + 全服拟合定数交叉判定）。`);
  }

  if (highlights.weakCharts.length > 0) {
    parts.push(`相对你自己的 B50 平均水平，有 ${highlights.weakCharts.length} 张明显偏低。`);
  }

  return parts.join('');
}
