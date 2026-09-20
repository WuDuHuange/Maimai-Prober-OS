/**
 * 报告输出核对 —— 防幻觉的**事后**一层。
 *
 * ## 为什么是事后核对而不是事前预防
 * 幻觉的根源不是「模型缺知识」，而是**模型倾向补全它不确定的东西**。
 * 本地 maimai 数据（1394 首曲库 + 21 个社区 tag）已经结构化且体量不大，
 * 上 RAG / 向量库的收益很低，维护成本却高。
 *
 * 更有效的是：把 AI 提到的**具体曲名**拿回本地曲库逐个核对，
 * 对不上的直接在 UI 上标出来。这样用户一眼就能看见「哪几条可能是编的」，
 * 而不是被动相信一段看起来很专业的文字。
 *
 * ## 误报控制
 * 抽的是「」《》`` 里的短语，但报告里这类引号也会包住维度名、tag 名、术语，
 * 所以调用方要把**已知词汇**传进来（维度标签 / tag 名 / 常用术语），
 * 命中的直接跳过，不参与核对。
 */
import type { SongMeta } from '@/types/song';
import { normalizeTitle } from '@/types/tag';

export interface MentionCheck {
  /** 在曲库中找到的提及（原样返回，便于展示） */
  verified: string[];
  /**
   * 未能在曲库中找到、也不属于已知词汇的提及。
   * ⚠️ 这**不等于**「一定是编的」—— 可能是简称、别名、或非曲名的引号内容，
   *    所以 UI 文案要写成「未能核对」，而不是「编造」。
   */
  unverified: string[];
}

/** 难度后缀 —— AI 常写成「曲名 (MASTER)」「曲名 MASTER」「曲名【紫】」 */
const DIFF_SUFFIX = [
  'basic', 'advanced', 'expert', 'master', 'remaster',
  'bas', 'adv', 'exp', 'mas', 'rem',
  '紫', '红', '白', '黄', '绿', '蓝',
];

/** 去掉结尾的难度标记，便于匹配纯曲名 */
function stripDiffSuffix(s: string): string {
  let t = s;
  for (const w of DIFF_SUFFIX) {
    const re = new RegExp(`[\\s\\-–—\\[（(【]*${w}[\\]）)】]*$`, 'i');
    if (re.test(t)) {
      t = t.replace(re, '').trim();
      break;
    }
  }
  return t;
}

/** 抽取报告里所有被引号包住的短语 */
function extractQuoted(md: string): string[] {
  const out: string[] = [];
  const patterns = [/「([^」\n]{2,60})」/g, /《([^》\n]{2,60})》/g, /`([^`\n]{2,60})`/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      const v = m[1].trim();
      if (v) out.push(v);
    }
  }
  return out;
}

/**
 * 核对报告里提到的曲名。
 *
 * @param markdown   报告正文（Markdown）
 * @param songs      本地曲库
 * @param knownTerms 已知词汇（维度标签 / tag 名 / 术语），命中即跳过
 */
export function checkSongMentions(
  markdown: string,
  songs: Iterable<SongMeta>,
  knownTerms: Iterable<string> = []
): MentionCheck {
  const known = new Set<string>();
  for (const t of knownTerms) {
    const n = normalizeTitle(t);
    if (n) known.add(n);
  }

  const titles = new Set<string>();
  for (const s of songs) {
    const n = normalizeTitle(s.title);
    if (n) titles.add(n);
  }

  const verified: string[] = [];
  const unverified: string[] = [];
  const seen = new Set<string>();

  for (const raw of extractQuoted(markdown)) {
    const norm = normalizeTitle(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);

    // 已知词汇（维度名 / tag 名 / 术语）不参与核对
    if (known.has(norm)) continue;

    // 纯曲名命中
    if (titles.has(norm)) { verified.push(raw); continue; }

    // 去掉难度后缀再试
    const stripped = stripDiffSuffix(raw);
    const normStripped = normalizeTitle(stripped);
    if (normStripped && (titles.has(normStripped) || known.has(normStripped))) {
      verified.push(raw);
      continue;
    }

    // 曲名被夹在其他文字里（如「推荐练 Xxx Yyy 这张」）—— 做一次包含匹配兜底
    let partial = false;
    for (const t of titles) {
      if (t.length >= 4 && (norm.includes(t) || t.includes(norm))) { partial = true; break; }
    }
    if (partial) { verified.push(raw); continue; }

    unverified.push(raw);
  }

  return { verified, unverified };
}
