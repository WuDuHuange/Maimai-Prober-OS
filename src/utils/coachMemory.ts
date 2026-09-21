/**
 * AI 教练上下文管理
 *
 * ## 分层设计
 * 上下文按「变化频率」分五层，越稳定的越靠前、越省 token：
 *
 * | 层 | 内容 | 变化频率 | 预算 |
 * |---|---|---|---|
 * | L0 系统人格 | SYSTEM_PROMPT（含工具清单） | 不变 | — |
 * | L1 玩家画像 | 昵称 / Rating / 总游玩 / 曲库规模 | 每次同步 | 300 字 |
 * | L2 分析快照 | B50 六维 + 结构 + 亮点 + **全量清单**（锚点） | 点一次分析 | 3400 字 |
 * | L3 滚动摘要 | AI 定期总结的目标 / 偏好 / 结论 | 每 4 轮 | 400 字 |
 * | L4 近期对话 | 最近 N 轮原文 | 每轮 | 2600 字 |
 *
 * ## 为什么 L2 是「锚点」
 * 用户点「生成 B50 能力分析」后，分析结论会写进 L2 并**一直保留**。
 * 后续任何提问都会带上它 —— 这样用户可以直接问「我该怎么提升最弱的那一维」，
 * 而不需要重新描述自己的数据。分析快照只在重新分析时被替换。
 *
 * ## 预算控制
 * L4 从最新往回取，超出预算就丢最旧的；L2/L3 超预算则**掐中间保两头**
 * （见 `truncate`）—— 因为 L2 的头部是六维、尾部是 B50 全量清单，两头都不能丢。
 * 目的是让上下文长度可预测，避免长对话把窗口撑爆。
 */
import type { B50AnalysisResult } from '@/types/b50Analysis';
import { DIFFICULTY_LABEL_SHORT } from '@/types/song';

/** 各层字符预算 */
export const CONTEXT_BUDGET = {
  profile: 300,
  /**
   * L2 预算。注意：快照尾部是「B50 全量清单」，AI 推荐练习曲时要用它，
   * 所以这个预算必须**留足**，否则截断会把最有用的部分切掉。
   * 后来又补了「技术类型专项」「选曲口味」「硬度口径」三节 —— 这三节是
   * 「教练分析详情度不够」的根因（此前 AI 手上根本没有类型/曲风数据）。
   */
  snapshot: 4200,
  summary: 400,
  history: 2600,
} as const;

/** 快照里每条谱面最多展示几个 tag —— 全量 tag 会让快照膨胀数倍 */
const SNAPSHOT_TAGS_PER_CHART = 6;

/** 快照里「打谱偏向」最多展示几个强项 / 弱项组合 */
const COMBO_SHOWN = 5;

/** 快照 / UI 里「单项 tag」两端各展示几个 */
const TAG_SHOWN = 2;

export interface PlayerProfileFacts {
  nickname: string;
  rating: number;
  totalPlays: number;
  avgAchievement: number | null;
  songDbSize: number;
}

export interface LayeredContextInput {
  profile: PlayerProfileFacts | null;
  /** L2 分析快照（已渲染成文本，由 setAnalysisSnapshot 写入） */
  snapshot: string;
  /** L3 滚动摘要 */
  summary: string;
  /** L4 近期对话（旧 → 新） */
  history: { role: 'user' | 'assistant'; content: string }[];
  /** L5 当前消息。省略或空串时不产出 L5 段（供调用方自己追加） */
  current?: string;
}

/**
 * 截断策略：**掐中间，保两头**。
 * L2 快照的头部是结构 + 六维，尾部是 B50 全量清单 —— 两头都有用，
 * 只有中间的「亮点谱面明细」是可以牺牲的。
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const headLen = Math.floor(max * 0.55);
  const tailLen = Math.max(0, max - headLen - 60);
  const omitted = s.length - headLen - tailLen;
  return (
    s.slice(0, headLen) +
    `\n…（中间省略 ${omitted} 字）…\n` +
    s.slice(s.length - tailLen)
  );
}

/** L1 玩家画像 */
export function renderProfile(f: PlayerProfileFacts): string {
  const lines = [
    `## [L1] 玩家画像`,
    `- 昵称: ${f.nickname || '未知'}`,
    `- 当前 Rating: ${f.rating}`,
    `- 总游玩次数: ${f.totalPlays}`,
    f.avgAchievement != null ? `- 近期平均达成率: ${f.avgAchievement.toFixed(2)}%` : null,
    `- 曲库规模: ${f.songDbSize} 首`,
  ].filter(Boolean);
  return truncate(lines.join('\n'), CONTEXT_BUDGET.profile);
}

/**
 * 组装分层上下文。
 * 空层自动跳过；L4 按预算从新到旧保留。
 */
export function buildLayeredContext(input: LayeredContextInput): string {
  const segments: string[] = [];

  if (input.profile) {
    segments.push(renderProfile(input.profile));
  }

  if (input.snapshot.trim()) {
    segments.push(truncate(`## [L2] B50 分析快照（本地算法产出，可直接引用）\n${input.snapshot}`, CONTEXT_BUDGET.snapshot));
  }

  if (input.summary.trim()) {
    segments.push(truncate(`## [L3] 长期记忆（此前对话的结论与偏好）\n${input.summary}`, CONTEXT_BUDGET.summary));
  }

  if (input.history.length > 0) {
    // 从最新往回累积，直到超出预算
    const picked: string[] = [];
    let used = 0;
    for (let i = input.history.length - 1; i >= 0; i--) {
      const h = input.history[i];
      const line = `${h.role === 'user' ? '玩家' : '教练'}: ${h.content}`;
      if (used + line.length > CONTEXT_BUDGET.history && picked.length > 0) break;
      picked.unshift(line);
      used += line.length;
    }
    if (picked.length > 0) {
      segments.push(`## [L4] 近期对话\n${picked.join('\n')}`);
    }
  }

  if (input.current && input.current.trim()) {
    segments.push(`## [L5] 当前问题\n${input.current}`);
  }

  return segments.join('\n\n---\n\n');
}

/**
 * 把分析结果渲染成 L2 快照文本。
 * 这里刻意**只给结构化事实**，不下结论 —— 结论交给 AI 结合用户问题去讲。
 */
export function renderAnalysisSnapshot(r: B50AnalysisResult): string {
  const L: string[] = [];
  const s = r.structure;

  L.push(`### 基本结构`);
  L.push(`- B50 总 Rating ${s.totalRating}（B15 ${s.b15Count} 条 / B35 ${s.b35Count} 条）`);
  L.push(`- 平均定数 ${s.avgConstant.toFixed(2)}，最高定数 ${s.maxConstant.toFixed(1)}`);
  L.push(`- 平均达成率 ${s.avgAchievement.toFixed(2)}%，标准差 ${s.achievementStdDev.toFixed(2)}`);
  L.push(`- 鸟（≥100%）${s.countBird} 张，鸟加（≥100.5%）${s.countBirdPlus} 张`);
  L.push(`- B15 平均定数 ${s.b15AvgConst.toFixed(2)} / B35 平均定数 ${s.b35AvgConst.toFixed(2)}`);

  L.push(`\n### 六维评分（0–100，本地算法产出）`);
  for (const d of r.dimensions) {
    L.push(`- ${d.label} ${d.score}${d.insufficient ? '（数据不足，中性值）' : ''} —— ${d.rawLabel}`);
  }

  L.push(`\n### 基准可用性`);
  L.push(`- 同段聚合基准（peer_stats）：**不可用**（数据源 502）`);
  L.push(`- 全服拟合定数基准：覆盖 ${r.baselineCoverage.matched}/${r.baselineCoverage.total} 张`);
  L.push(`- 社区标注（DXRating）：${r.tagAvailable ? '可用' : '不可用'}`);
  L.push(
    `- ⚠️ 因此本分析**不做任何跨玩家强弱断言**。` +
    `「相对自己偏低」是玩家 B50 内部对比（该谱达成率 − 自己 B50 平均达成率），不是与他人比较。`
  );

  /** 相对自身 B50 平均的差值，带符号 */
  const fmtDelta = (v: number | null | undefined) =>
    v == null ? '?' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

  /** verdict → 中文标签 */
  const verdictLabel = (v: string) =>
    v === 'strong' ? '**强项**'
      : v === 'weak' ? '**短板**'
        : v === 'insufficient' ? '样本不足' : '与自身持平';

  // ── 技术类型专项（DXRating「评价」组）──
  if (r.typeSpecialties.length > 0) {
    L.push(`\n### 技术类型专项（DXRating「评价」组社区标注）`);
    for (const t of r.typeSpecialties) {
      if (t.chartCount === 0) continue;
      L.push(
        `- ${t.name}：B50 中 ${t.chartCount} 张，平均达成 ${t.avgAchievement?.toFixed(2) ?? '?'}%，` +
        `相对自身 ${fmtDelta(t.avgOwnDelta)} → ${verdictLabel(t.verdict)}`
      );
      // 只在有明确结论时给代表谱，避免快照膨胀
      const ref = t.verdict === 'weak' ? t.worstChart : t.bestChart;
      if (ref && t.chartCount >= 3) {
        L.push(
          `  · 代表谱：${ref.title} ${DIFFICULTY_LABEL_SHORT[ref.difficulty]} ` +
          `${ref.constant?.toFixed(1) ?? '?'} 达成 ${ref.achievements.toFixed(2)}%`
        );
      }
    }
    L.push(`- ⚠️ 类型是**社区标注**，只覆盖被标注过的谱面，未列出的类型 = 数据缺失，不要臆测。`);
  }

  // ── 选曲口味（官方 genre）—— 只描述兴趣结构，不评强弱 ──
  if (r.genreTastes.length > 0) {
    L.push(`\n### 选曲口味（水鱼官方 genre 分类，非社区标注）`);
    L.push(`- ⚠️ 本节**只描述选曲兴趣结构**，与水平无关 —— 不要据此判断强弱或给练习建议。`);
    for (const g of r.genreTastes) {
      L.push(
        `- ${g.genre}：${g.chartCount} 张（占 ${(g.share * 100).toFixed(0)}%），` +
        `平均达成 ${g.avgAchievement?.toFixed(2) ?? '?'}%，平均定数 ${g.avgConstant?.toFixed(1) ?? '?'}`
      );
    }
  }

  // ── 打谱偏向（单 tag 两端 + tag 两两组合）—— 两者必须对照看 ──
  if (r.tagPerformance.length > 0 || r.typeCombos.length > 0) {
    L.push(`\n### 打谱偏向（相对本人 B50 平均达成率的差，正 = 比平均打得好）`);
    L.push(`- 口径：B50 内命中该 tag / 该组合的谱面（样本 ≥ 3 张）的达成率，减去本人 B50 平均达成率。`);

    const perf = r.tagPerformance;
    if (perf.length > 0) {
      const fmtPerf = (t: typeof perf[number]) =>
        `${t.name}（${fmtDelta(t.avgOwnDelta)}，${t.chartCount} 张，` +
        `${t.group === 'config' ? '配置组' : '评价组'}，平均定数 ${t.avgConstant?.toFixed(1) ?? '?'}）`;
      const strong = perf.slice(0, TAG_SHOWN);
      const weak = perf.slice(-TAG_SHOWN).reverse();
      L.push(`- **单项 tag 最强**：${strong.map(fmtPerf).join('；')}`);
      L.push(`- **单项 tag 最弱**：${weak.map(fmtPerf).join('；')}`);
    }

    const strongCombo = r.typeCombos.filter(c => c.verdict === 'strong').slice(0, COMBO_SHOWN);
    const weakCombo = [...r.typeCombos].reverse().filter(c => c.verdict === 'weak').slice(0, COMBO_SHOWN);
    if (strongCombo.length) {
      L.push(`- 打得好的组合：`);
      L.push(...strongCombo.map(c =>
        `  · ${c.label}：${c.chartCount} 张，相对自身 ${fmtDelta(c.avgOwnDelta)}`
      ));
    }
    if (weakCombo.length) {
      L.push(`- 打得差的组合：`);
      L.push(...weakCombo.map(c =>
        `  · ${c.label}：${c.chartCount} 张，相对自身 ${fmtDelta(c.avgOwnDelta)}`
      ));
    }
    if (!strongCombo.length && !weakCombo.length && r.typeCombos.length > 0) {
      L.push(`- 共 ${r.typeCombos.length} 个组合达标，但没有一个偏离自身平均超过 ±0.3 —— 表现相当均匀。`);
    }
    L.push(`- ⚠️ **单项与组合要对照着看**：若单项都不弱、两两叠加却明显偏低，` +
      `说明瓶颈在「同时处理多个干扰源」，**不要**把它归因成某个单项的短板。`);
  }

  // ── 硬度口径分解 ──
  const hd = r.hardness;
  L.push(`\n### 硬度口径分解`);
  L.push(
    `- 识别到硬谱 ${hd.hardCount} 张（社区标「诈称谱」或水度 z ≤ −1.5）；` +
    `其中落在 B50 里的只有 ${hd.b50HardCount}/${hd.b50RatedCount} 张（${(hd.b50HardRate * 100).toFixed(1)}%）`
  );
  L.push(
    `- 取达成率最高的 ${hd.samples.length} 张硬谱：平均 ${hd.sampleAvgAchievement?.toFixed(2) ?? '?'}%，` +
    `相对本人 B50 平均 ${fmtDelta(hd.hardDelta)}`
  );
  L.push(
    `- ⚠️ B50 内硬谱占比低是**正常现象**（硬谱难打 → 进不了 B50），该占比**不计入评分**。` +
    `硬度分数只看硬谱上的实际表现。`
  );
  if (hd.samples.length > 0) {
    L.push(
      `- 硬谱取样：` +
      hd.samples.slice(0, 5).map(s =>
        `${s.title} ${DIFFICULTY_LABEL_SHORT[s.difficulty]}${s.constant?.toFixed(1) ?? '?'}=${s.achievements.toFixed(2)}%`
      ).join(' / ')
    );
  }

  const h = r.highlights;
  /** 截断 tag 列表，避免单行过长把快照预算吃光 */
  const tagStr = (c: { tagNames: string[] }) => {
    if (!c.tagNames.length) return '';
    const shown = c.tagNames.slice(0, SNAPSHOT_TAGS_PER_CHART).join(',');
    return ` tags=[${shown}${c.tagNames.length > SNAPSHOT_TAGS_PER_CHART ? `,+${c.tagNames.length - SNAPSHOT_TAGS_PER_CHART}` : ''}]`;
  };

  if (h.waterCharts.length || h.underratedCharts.length) {
    L.push(`\n### 谱面性质（社区标注 ∩ 全服拟合定数）`);
    L.push(`- 偏「水」（tag「水」或水度 z ≥ +1.5）：${h.waterCharts.length} 张`);
    if (h.waterCharts.length) {
      L.push(...h.waterCharts.slice(0, 6).map(c =>
        `  · ${c.title} [${c.type}] ${DIFFICULTY_LABEL_SHORT[c.difficulty]} ${c.constant?.toFixed(1) ?? '?'} 达成 ${c.achievements.toFixed(2)}%` +
        `${c.waterZ != null ? ` 水度z=${c.waterZ}` : ''}${tagStr(c)}`
      ));
    }
    L.push(`- 偏「硬」（tag「诈称谱」或水度 z ≤ −1.5）：${h.underratedCharts.length} 张`);
    if (h.underratedCharts.length) {
      L.push(...h.underratedCharts.slice(0, 6).map(c =>
        `  · ${c.title} [${c.type}] ${DIFFICULTY_LABEL_SHORT[c.difficulty]} ${c.constant?.toFixed(1) ?? '?'} 达成 ${c.achievements.toFixed(2)}%` +
        `${tagStr(c)}`
      ));
    }
  }

  if (h.weakCharts.length) {
    L.push(`\n### 相对自己 B50 平均偏低的谱面（内部对比，非跨玩家）`);
    L.push(...h.weakCharts.slice(0, 8).map(c =>
      `- ${c.title} [${c.type}] ${DIFFICULTY_LABEL_SHORT[c.difficulty]} ${c.constant?.toFixed(1) ?? '?'} 达成 ${c.achievements.toFixed(2)}% (Δ${c.ownDelta.toFixed(2)})`
    ));
  }

  // 完整 B50 清单（紧凑格式），供 AI 推荐练习曲时取用
  L.push(`\n### B50 全量清单（紧凑）`);
  L.push(...r.charts.map(c =>
    `${c.title}[${c.type}]${DIFFICULTY_LABEL_SHORT[c.difficulty]}${c.constant?.toFixed(1) ?? '?'}=${c.achievements.toFixed(2)}%`
  ));

  return L.join('\n');
}

/** 生成给 AI 的「请基于分析快照展开」指令 */
export function buildAnalysisRequest(r: B50AnalysisResult): string {
  const dims = r.dimensions.filter(d => !d.insufficient);
  const weakest = [...dims].sort((a, b) => a.score - b.score)[0];
  const focus = weakest ? `重点解释「${weakest.label}」这一维（得分 ${weakest.score}）的成因。` : '';

  const weakType = r.typeSpecialties.find(t => t.verdict === 'weak');
  const typeFocus = weakType
    ? `我的短板类型是「${weakType.name}」，请重点分析这一类。`
    : '';

  return [
    `我刚生成了 B50 能力分析（见上方 L2 快照）。请基于**快照里的真实数据**给我一份解读，要求：`,
    ``,
    `1. **总览**：两三句话点出我当前的 B50 结构特征（不要复述数字，讲结论）。`,
    `2. **六维解读**：**六个维度必须逐一独立成条**，每维一条，格式为「维度名 分数 —— 解读」。${focus}`,
    `3. **技术类型专项**：快照「技术类型专项」一节列了星星谱/键盘谱/体力谱/底力谱/高物量五类的表现。` +
      `逐类讲清我的强弱，并说明短板类型**具体卡在哪**（是读谱、手速、体力还是爆发）。${typeFocus}`,
    `4. **打谱偏向**：结合「打谱偏向」一节，**先讲单项 tag**（最强 2 个 / 最弱 2 个，分别说明这意味着什么），` +
      `**再讲组合**（哪些组合明显好、哪些明显差），最后**把单项与组合对照**：` +
      `若单项都不弱、两两叠加却崩，瓶颈在「同时处理多个干扰源」，` +
      `**不要**把组合效应归因成某个单项的短板。`,
    `5. **选曲口味**：结合「选曲口味」一节，只谈我的**曲风兴趣分布**（偏好集中在哪里）。` +
      `⚠️ 口味与水平无关 —— **不要**评价哪种曲风打得好坏，也不要据此给练习建议。`,
    `6. **谱面性质**：结合「水」/「诈称谱」社区标注与拟合定数，谈谈我的 B50 是不是靠偏水的谱堆起来的。` +
      `并说明我的硬度分意味着什么（快照里写了口径：只看硬谱上的实际表现）。`,
    `7. **可操作建议**：给出 3–5 条具体建议，能落到具体谱面上就落到谱面。`,
    ``,
    `约束：`,
    `- ⚠️ **六维必须逐条独立**。禁止把两个维度写进同一句（例如「精度 100 / 稳定 75」）；` +
      `也禁止在某一维里塞入与该维无关的数字 —— 讲「精度」时提「鸟加多少张」是错的，那是结构数据。`,
    `- **禁止**说「高于/低于同段平均」「同水平玩家」这类话 —— 同段基准不可用，快照里写明了。`,
    `- **不要编造数据。** 所有数字必须来自快照，或来自你通过工具查到的真实数据。`,
    `- **推荐具体曲目之前，必须先用 search_songs 工具确认这首歌在你的曲库里存在**，不要凭印象写曲名。`,
    `- 快照里没有的数据（某个类型没被标注、某首歌没有统计）就直说「数据缺失」，不要推测。`,
    `- 用中文，Markdown 小标题 + 要点列表，控制在 800 字以内。`,
  ].join('\n');
}
