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

  const weakTypes = r.typeSpecialties.filter(t => t.verdict === 'weak');
  const strongTypes = r.typeSpecialties.filter(t => t.verdict === 'strong');
  const typeHint = [
    weakTypes.length ? `快照里标记为短板的类型：${weakTypes.map(t => t.name).join('、')}` : '',
    strongTypes.length ? `标记为强项的：${strongTypes.map(t => t.name).join('、')}` : '',
  ].filter(Boolean).join('；');

  // ⚠️ 口味只描述兴趣结构，**不评强弱** —— 这里只给「最常打的两类」作提示
  const topGenres = r.genreTastes.slice(0, 2);
  const genreHint = topGenres.length
    ? `最常打的曲风：${topGenres.map(g => `${g.genre}（${g.chartCount} 张）`).join('、')}`
    : '';

  // 打谱偏向：给 AI 点出两端的组合，省得它自己在长清单里找
  const comboStrong = r.typeCombos.filter(c => c.verdict === 'strong').slice(0, 3);
  const comboWeak = [...r.typeCombos].reverse().filter(c => c.verdict === 'weak').slice(0, 3);
  const comboHint = [
    comboStrong.length ? `打得好的组合：${comboStrong.map(c => c.label).join('、')}` : '',
    comboWeak.length ? `打得差的组合：${comboWeak.map(c => c.label).join('、')}` : '',
  ].filter(Boolean).join('；');

  const lines = [
    `我刚生成了 B50 能力分析（见上方 [L2] 快照）。请给我一份**完整的诊断报告**，我会存档反复回看。`,
    ``,
    `按下面的结构写，每一节都要落到**快照里的真实数字或具体谱面**：`,
    ``,
    `## 一、整体判断`,
    `3–4 句讲清我的 B50 是什么形态：是靠定数堆起来的，还是靠高达成率撑起来的？新旧曲结构如何？不要复述数字。`,
    ``,
    `## 二、六维逐项解读`,
    `**六个维度必须逐一独立成条**（每维一条，格式「维度名 分数 —— 解读」）。` +
      `禁止把两个维度合并成一句，也不要在某一维里塞入与该维无关的数字。`,
    `每条讲清：这个分数意味着什么、对应的短板具体会卡在哪些类型的谱面上。`,
  ];

  if (weakest && strongest) {
    lines.push(
      `当前最弱是「${weakest.label}」（${weakest.score} 分），最强是「${strongest.label}」（${strongest.score} 分）。` +
      `重点解释这两维，以及它们之间的落差说明了什么。`
    );
  }

  lines.push(
    ``,
    `## 三、技术类型专项分析`,
    `快照「技术类型专项」一节列了星星谱 / 键盘谱 / 体力谱 / 底力谱 / 高物量 五类（DXRating 社区标注）的表现。`,
    `逐类分析：我在这一类上强不强、为什么、代表谱是哪张。**短板类型要讲透** —— ` +
      `它具体卡在哪个环节（读谱、手速、体力分配、爆发衔接），以及练什么能改善。`,
    typeHint ? `（${typeHint}）` : '',
    ``,
    `## 四、打谱偏向分析`,
    `快照「打谱偏向」一节把 tag 做了**两两组合**统计（配置类 tag × 评价类 tag），` +
      `反映的是**组合效应** —— 单看「星星谱」也许还行，但「星星谱 + 交互」可能明显更差。`,
    `请指出：哪些组合我打得明显好、哪些明显差，并解释这种组合效应背后的技术原因` +
      `（例如两类配置叠加时读谱 / 手速 / 体力哪个先成为瓶颈）。只谈打得**好或差**的组合，不要罗列全部组合。`,
    comboHint ? `（${comboHint}）` : '',
    ``,
    `## 五、选曲口味与风格倾向`,
    `结合「选曲口味」一节（水鱼官方 genre 分类）谈我的曲风构成：**常打哪几类、结构是否偏窄、` +
      `是否长期只在少数曲池里打**。`,
    `⚠️ 这一节**只描述选曲兴趣，与水平无关** —— **禁止**评价哪类曲风「打得好 / 打得差 / 是短板」，` +
      `曲风分布反映的是偏好不是能力。要谈强弱请放到第三节（技术类型专项）和第四节（打谱偏向）。`,
    genreHint ? `（${genreHint}）` : '',
    ``,
    `## 六、谱面性质分析`,
    `结合社区标注（DXRating 的「水」/「诈称谱」）与全服拟合定数，判断我的 B50 里有多少是靠偏水的谱堆出来的。`,
    `另外解释我的「硬度」分：快照里写了口径 —— **只看硬谱上的实际表现，B50 内硬谱占比不计分**。要点名具体谱面。`,
    ``,
    `## 七、可操作建议`,
    `4–6 条，按优先级排序。每条说清「练什么 → 为什么 → 预期收益」，能落到具体曲目就给出曲名、难度和定数。`,
    ``,
    `## 八、下阶段目标`,
    `给出一个具体、可衡量的短期目标（例如定数区间、达成率门槛、鸟/鸟加数量，或某个短板类型的达成率提升幅度）。`,
    ``,
    `---`,
    `约束：`,
    `- **禁止**出现「同段平均」「同水平玩家」「高于/低于平均水平」这类表述 —— 同段基准数据源当前不可用，快照里已写明原因。`,
    `- **不要编造数据。** 所有数字必须来自快照，或来自你通过工具查到的真实数据。`,
    `- **推荐具体曲目之前，必须先用 search_songs 工具确认这首歌在你的曲库里存在**，不要凭印象写曲名。`,
    `- 快照里没有的数据（某个类型未被标注、某首歌无统计）就直说「数据缺失」，不要推测或补全。`,
    `- 需要更细的记录（某首歌的历史成绩、最近的翻车谱、某张谱的社区标注）就调工具去查，不要凭印象说。`,
    `- 中文，Markdown 格式，总长 1000–1600 字。`,
  );

  return lines.filter(Boolean).join('\n');
}
