/**
 * 谱面 tag —— 数据源：DXRating（gekichumai/dxrating）
 * `GET https://miruku.dxrating.net/api/v1/tags`（公开免鉴权）
 *
 * ⚠️ 这些 tag 是**社区标注**，不是官方数据。产品文案写「社区标注」，
 *    不要写「官方」「共识」。
 */

/** 多语言字符串，键为语言码：'en' | 'ja' | 'zh-Hans' | 'zh-Hant' */
export type LocalizedString = Record<string, string>;

/** DXRating 原始 tag */
export interface RawTag {
  id: number;
  localized_name: LocalizedString;
  localized_description: LocalizedString;
  group_id: number | null;
}

export interface RawTagGroup {
  id: number;
  localized_name: LocalizedString;
  color: string;
}

export interface RawTagSong {
  /** ⚠️ 默认 idScheme 下这里是**曲名**，不是数字 ID */
  song_id: string;
  /** ⚠️ 实测 0/6963 条存在，不要用 */
  sheet_id?: string;
  /** 'std' | 'dx' | 'utage' | 'utage2p' */
  sheet_type: string;
  /** 'basic'|'advanced'|'expert'|'master'|'remaster'|'【宴】'… */
  sheet_difficulty: string;
  tag_id: number;
}

export interface RawTagsResponse {
  tags: RawTag[];
  tagGroups: RawTagGroup[];
  tagSongs: RawTagSong[];
}

/** 归一化后的 tag（已选定展示语言） */
export interface ChartTag {
  id: number;
  name: string;
  nameEn: string;
  description: string;
  groupId: number | null;
  groupName: string;
  groupColor: string;
}

/** tag 分组（已选定展示语言） */
export interface TagGroupInfo {
  id: number;
  name: string;
  color: string;
}

/** 解析完成后的 tag 目录 */
export interface TagCatalog {
  tags: ChartTag[];
  groups: TagGroupInfo[];
  /**
   * 谱面 → tag 列表。
   * key = `${songId}|${difficulty}`，与 B50Record 的 (songId, difficulty) 口径一致。
   */
  byChart: Map<string, ChartTag[]>;
  /** 落地统计，用于设置页展示与排障 */
  stats: TagCatalogStats;
  /** 数据拉取时间（ISO） */
  fetchedAt: string;
}

export interface TagCatalogStats {
  /** 原始 tagSong 关联数 */
  totalAssociations: number;
  /** 成功定位到 (songId, difficulty) 的关联数 */
  resolved: number;
  /** 水鱼曲库中不存在的曲目导致的丢弃数 */
  droppedNoSong: number;
  /** 类型/难度对不上导致的丢弃数（含 DXRating 自身 sheet_type 与目录不符的情况） */
  droppedMismatch: number;
  /** 最终覆盖的唯一谱面数 */
  chartCount: number;
  /** 最终覆盖的曲目数 */
  songCount: number;
}

/** 谱面 tag 的语义分类（用于分析算法取数） */
export const TAG_IDS = {
  /** 水 / Overrated —— 社区认为比标称难度容易 */
  OVERRATED: 11,
  /** 诈称谱 / Underrated —— 社区认为比标称难度难 */
  UNDERRATED: 13,
  /** 高物量 / Dense */
  DENSE: 22,
} as const;

/** 分组 id */
export const TAG_GROUP_IDS = {
  CONFIG: 1,      // 配置
  DIFFICULTY: 2,  // 难度
  EVALUATION: 3,  // 评价
} as const;

/** 归一化曲名：NFKC + trim + 小写 + 去空白 + 全/半角标点统一 */
export function normalizeTitle(s: string | undefined | null): string {
  return String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u3000\s]+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[～~〜]/g, '~')
    .replace(/[！!]/g, '!')
    .replace(/[？?]/g, '?');
}

/** 难度名 → level_index（水鱼 ds[] 的下标） */
export const DIFFICULTY_INDEX: Record<string, number> = {
  basic: 0,
  advanced: 1,
  expert: 2,
  master: 3,
  remaster: 4,
};

/** sheet_type → 水鱼 type */
export function sheetTypeToSongType(sheetType: string): 'SD' | 'DX' | null {
  if (sheetType === 'std') return 'SD';
  if (sheetType === 'dx') return 'DX';
  return null; // utage / utage2p 丢弃
}

/** 构造谱面键，与 B50Record 口径一致 */
export function chartTagKey(songId: number | string, difficulty: string): string {
  return `${songId}|${difficulty}`;
}
