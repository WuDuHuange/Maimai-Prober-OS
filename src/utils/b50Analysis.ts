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
 * | consistency | 稳定 | B50 内达成率标准差（逆向） | 1.8 → 0.4 |
 * | breadth | 广度 | 「配置」组 tag 的香农熵（归一化） | 0 → ln(K) |
 * | hardness | 硬度 | 诈称谱 tag 占比 | 0 → 45% |
 * | adaptation | 版本适应 | B15 平均定数 ÷ B35 平均定数 | 0.97 → 1.03 |
 */
import type { B50Record } from '@/types/b50';
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';
import type { TagCatalog } from '@/types/tag';
import { DIFFICULTY_INDEX, TAG_IDS, TAG_GROUP_IDS, chartTagKey } from '@/types/tag';
import type { ChartStatsPayload } from '@/services/chartStatsApi';
import { getChartStat } from '@/services/chartStatsApi';
import type {
  AbilityDimension,
  AnalysisHighlights,
  B50AnalysisResult,
  B50Structure,
  ChartAnalysis,
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
}

export function analyzeB50(input: AnalyzeB50Input): B50AnalysisResult {
  const { b50List, songMap, tagCatalog, statsPayload, playerRating, playerName } = input;

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
  const dimensions = buildDimensions(charts, structure, tagCatalog);
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
    charts,
    headline: buildHeadline(dimensions, structure, highlights),
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
  charts: ChartAnalysis[],
  structure: B50Structure,
  tagCatalog: TagCatalog | null
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

  // 4) 广度 —— 「配置」组 tag 的香农熵
  const configTags = (tagCatalog?.tags ?? []).filter(t => t.groupId === TAG_GROUP_IDS.CONFIG);
  const configIds = new Set(configTags.map(t => t.id));
  const configCount = new Map<number, number>();
  let configTotal = 0;
  for (const c of charts) {
    for (const t of c.tags) {
      if (!configIds.has(t.id)) continue;
      configCount.set(t.id, (configCount.get(t.id) ?? 0) + 1);
      configTotal++;
    }
  }

  if (configTotal === 0 || configTags.length < 2) {
    dims.push({
      id: 'breadth', label: '广度', score: 50, raw: 0, rawLabel: '无标注数据',
      basis: 'B50 谱面的技术配置 tag 覆盖广度 —— 数据不足，取中性值 50',
      insufficient: true,
    });
  } else {
    let entropy = 0;
    for (const count of configCount.values()) {
      const p = count / configTotal;
      entropy -= p * Math.log(p);
    }
    const maxEntropy = Math.log(configTags.length);
    const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0;
    dims.push({
      id: 'breadth',
      label: '广度',
      score: Math.round(clamp(normalized * 100, 0, 100)),
      raw: round(entropy, 3),
      rawLabel: `配置类型 ${configCount.size}/${configTags.length} 种`,
      basis: `B50 命中「配置」组 ${configCount.size} 种 tag 的香农熵 ÷ 上限 ln(${configTags.length})`,
    });
  }

  // 5) 硬度 —— 诈称谱占比（只按社区标注算；无标注时退到统计口径）
  const rated = charts.filter(c => c.tags.length > 0).length;
  const underratedCount = charts.filter(c => c.hasUnderratedTag).length;
  if (rated === 0) {
    const hardByStat = charts.filter(c => c.isHardByStat).length;
    const withStat = charts.filter(c => c.waterZ != null).length;
    if (withStat === 0) {
      dims.push({
        id: 'hardness', label: '硬度', score: 50, raw: 0, rawLabel: '无标注且无统计',
        basis: 'B50 中「诈称谱」占比 —— 社区标注与统计基准都不可用，取中性值 50',
        insufficient: true,
      });
    } else {
      const rate = hardByStat / withStat;
      dims.push({
        id: 'hardness',
        label: '硬度',
        score: Math.round(mapRange(rate, 0, 0.45)),
        raw: round(rate, 4),
        rawLabel: `统计口径偏硬 ${hardByStat}/${withStat}（${(rate * 100).toFixed(1)}%）`,
        basis: '社区标注不可用，退回统计口径：水度 z ≤ −1.5 的谱面占比，映射区间 0% → 45%',
      });
    }
  } else {
    const rate = underratedCount / rated;
    dims.push({
      id: 'hardness',
      label: '硬度',
      score: Math.round(mapRange(rate, 0, 0.45)),
      raw: round(rate, 4),
      rawLabel: `诈称谱 ${underratedCount}/${rated}（${(rate * 100).toFixed(1)}%）`,
      basis: 'B50 中带「诈称谱」社区标注的谱面占比，映射区间 0% → 45%',
    });
  }

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
  highlights: AnalysisHighlights
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
