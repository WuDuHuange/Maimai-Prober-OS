/**
 * 教练详细分析（持久化报告）
 *
 * ## 为什么要存一份
 * 对话流里的解读是**一次性**的 —— 清空对话就没了，再想看只能重新叫一次 AI（费额度、还得等）。
 * 这里把教练的详细分析**存成一份报告**（IndexedDB `appSettings['coach_report']`），
 * 随时点开看，不重复生成。
 *
 * ## 与对话流的区别
 * - 报告：结构化长文（800–1400 字），存档反复回看，独立于对话历史。
 * - 对话：围绕当前问题的短答，会随对话被清掉。
 *
 * ## 生成方式
 * 走 `agentChat`（带查库工具），教练能自己调 `get_b50_data` / `get_recent_fails` /
 * `get_chart_tags` 等工具补充数据，而不是只吃一份快照。
 * 这也是「查数据库」与「首次分析」两种能力落在同一个入口上。
 */
import type { B50AnalysisResult } from '@/types/b50Analysis';

/** 持久化到 db.appSettings 的键 */
export const COACH_REPORT_KEY = 'coach_report';

export interface CoachReport {
  generatedAt: string;
  provider: string;
  model: string;
  /** 生成时对应的分析指纹；与当前不符 = 分析数据已变，报告可能过期 */
  fingerprint: string;
  /** Markdown 正文 */
  content: string;
}

/**
 * 分析指纹：只取会影响结论的少数几个量。
 * 不追求密码学强度，只要「数据变了指纹就跟着变」。
 * 刻意**不含** `generatedAt` —— 同一份数据重算一次不该让报告变「过期」。
 */
export function analysisFingerprint(r: B50AnalysisResult): string {
  const s = r.structure;
  return [
    r.playerRating,
    s.totalRating,
    s.avgAchievement.toFixed(2),
    s.avgConstant.toFixed(2),
    s.countBirdPlus,
    r.charts.length,
    r.tagAvailable ? 'tag' : 'notag',
    r.baselineCoverage.matched,
  ].join('|');
}

/** 报告是否已过期（分析数据变了但报告还是旧的） */
export function isReportStale(
  report: Pick<CoachReport, 'fingerprint'> | null,
  r: B50AnalysisResult | null,
): boolean {
  if (!report || !r) return false;
  return report.fingerprint !== analysisFingerprint(r);
}

/**
 * 生成报告的指令。
 * 比 `buildAnalysisRequest`（对话版）更长、更结构化 —— 这份是要存下来反复读的，
 * 所以要求分节、点名具体谱面、给出可衡量目标。
 */
export function buildReportRequest(r: B50AnalysisResult): string {
  const dims = r.dimensions.filter(d => !d.insufficient);
  const sorted = [...dims].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  const lines = [
    `我刚生成了 B50 能力分析（见上方 [L2] 快照）。请给我一份**完整的诊断报告**，我会存档反复回看。`,
    ``,
    `按下面的结构写，每一节都要落到**快照里的真实数字或具体谱面**：`,
    ``,
    `## 一、整体判断`,
    `3–4 句讲清我的 B50 是什么形态：是靠定数堆起来的，还是靠高达成率撑起来的？新旧曲结构如何？不要复述数字。`,
    ``,
    `## 二、六维逐项解读`,
    `六个维度逐个讲：这个分数意味着什么、对应的短板具体会卡在哪些类型的谱面上。`,
  ];

  if (weakest && strongest) {
    lines.push(
      `当前最弱是「${weakest.label}」（${weakest.score} 分），最强是「${strongest.label}」（${strongest.score} 分）。` +
      `重点解释这两维，以及它们之间的落差说明了什么。`
    );
  }

  lines.push(
    ``,
    `## 三、谱面性质分析`,
    `结合社区标注（DXRating 的「水」/「诈称谱」）与全服拟合定数，判断我的 B50 里有多少是靠偏水的谱堆出来的。`,
    `要点名具体谱面。快照里某项数据缺失就直说缺，不要猜。`,
    ``,
    `## 四、可操作建议`,
    `4–6 条，按优先级排序。每条说清「练什么 → 为什么 → 预期收益」，能落到具体曲目就给出曲名、难度和定数。`,
    ``,
    `## 五、下阶段目标`,
    `给出一个具体、可衡量的短期目标（例如定数区间、达成率门槛、鸟/鸟加数量）。`,
    ``,
    `---`,
    `约束：`,
    `- **禁止**出现「同段平均」「同水平玩家」「高于/低于平均水平」这类表述 —— 同段基准数据源当前不可用，快照里已写明原因。`,
    `- 所有数字必须来自快照，或来自你通过工具查到的真实数据，**不许编造**。`,
    `- 需要更细的记录（某首歌的历史成绩、最近的翻车谱、某张谱的社区标注）就调工具去查，不要凭印象说。`,
    `- 中文，Markdown 格式，总长 800–1400 字。`,
  );

  return lines.join('\n');
}
