/**
 * DXRating tag → 本地数字 songId 的 join
 *
 * ## 为什么需要这个
 * DXRating 的 `tagSongs[].song_id` 默认是**曲名**，而本项目 `songStore.songs` 是
 * `Map<number, SongMeta>`，`getSong()` 用严格 Map 匹配。
 * 直接拿曲名去查会**静默返回 undefined**（表现为详情页「未知曲目」）。
 *
 * ## 路径顺序（重要）
 * **① 曲名 + type 直连本地曲库（首选）** → ② 未命中才走「跨 type 兜底」
 *
 * ⚠️ 不要以 `music-id-map.json` 为主路径 —— 它是**滞后快照**，不含最新曲目
 *   （实测：以它为主路径会多丢 273 条关联 / 59 个谱面）。
 *   实测「曲名直连」单独就能覆盖全部可落地项，map 的**增量贡献为 0**，
 *   因此本项目**不引入**那个 218 KB 资源。
 *
 * ## 陷阱
 * 1. `sheet_id` 实测 0/6963 条存在 → 不用
 * 2. 必须按 `sheet_type` 过滤，否则同曲名的 SD/DX 会串难度
 * 3. 必须校验该难度存在（`const !== null`）
 * 4. `utage` / `utage2p` 丢弃（宴谱不计入 B50）
 */
import type { SongMeta, DifficultyType } from '@/types/song';
import { getConstByDifficulty } from '@/types/song';
import {
  normalizeTitle,
  sheetTypeToSongType,
  DIFFICULTY_INDEX,
  chartTagKey,
  type RawTagsResponse,
  type TagCatalog,
  type ChartTag,
  type TagGroupInfo,
  type TagCatalogStats,
  type LocalizedString,
} from '@/types/tag';

/** 从多语言字符串里挑展示用文案：优先简中 → 英文 → 任意 */
function pickLocalized(s: LocalizedString | undefined): string {
  if (!s) return '';
  return s['zh-Hans'] || s['zh-Hant'] || s.en || Object.values(s)[0] || '';
}

function pickEn(s: LocalizedString | undefined): string {
  if (!s) return '';
  return s.en || Object.values(s)[0] || '';
}

export interface ResolveTagOptions {
  /** 展示语言偏好，默认 'zh-Hans' */
  locale?: 'zh-Hans' | 'en';
}

/**
 * 把 DXRating 原始响应解析成可按 (songId, difficulty) 查询的目录。
 *
 * @param payload DXRating `/tags` 原始响应
 * @param songs   本地曲库（水鱼曲目表），需含 title / type / 各难度定数
 */
export function resolveTagCatalog(
  payload: RawTagsResponse,
  songs: Iterable<SongMeta>,
  opts: ResolveTagOptions = {}
): TagCatalog {
  const locale = opts.locale ?? 'zh-Hans';

  // ---- 1) 曲名 + type → SongMeta[] ----
  const titleIndex = new Map<string, SongMeta[]>();
  let songCountAll = 0;
  for (const song of songs) {
    songCountAll++;
    const key = `${normalizeTitle(song.title)}|${song.type}`;
    const arr = titleIndex.get(key);
    if (arr) arr.push(song);
    else titleIndex.set(key, [song]);
  }

  // ---- 2) tag / group 元信息 ----
  const groupById = new Map<number, TagGroupInfo>();
  for (const g of payload.tagGroups ?? []) {
    groupById.set(g.id, {
      id: g.id,
      name: pickLocalized(g.localized_name),
      color: g.color || '#94A3B8',
    });
  }

  const tagById = new Map<number, ChartTag>();
  for (const t of payload.tags ?? []) {
    const group = t.group_id != null ? groupById.get(t.group_id) : undefined;
    tagById.set(t.id, {
      id: t.id,
      name: locale === 'en' ? pickEn(t.localized_name) : pickLocalized(t.localized_name),
      nameEn: pickEn(t.localized_name),
      description: pickLocalized(t.localized_description),
      groupId: t.group_id,
      groupName: group?.name ?? '',
      groupColor: group?.color ?? '#94A3B8',
    });
  }

  // ---- 3) join ----
  const byChart = new Map<string, ChartTag[]>();
  const seenPerChart = new Map<string, Set<number>>();
  const songIds = new Set<number>();
  let resolved = 0;
  let droppedNoSong = 0;
  let droppedMismatch = 0;

  for (const ts of payload.tagSongs ?? []) {
    const songType = sheetTypeToSongType(ts.sheet_type);
    if (!songType) continue; // 宴谱丢弃
    const levelIndex = DIFFICULTY_INDEX[ts.sheet_difficulty];
    if (levelIndex === undefined) continue; // 宴谱难度名等

    const key = `${normalizeTitle(ts.song_id)}|${songType}`;
    const candidates = titleIndex.get(key);

    if (!candidates || candidates.length === 0) {
      // 曲名在本地曲库完全不存在（多为国服版权下架曲）
      droppedNoSong++;
      continue;
    }

    const difficulty = ts.sheet_difficulty as DifficultyType;
    // 必须校验该难度确实存在 —— 曲名匹配上不代表这个难度有谱
    const hit = candidates.find(c => getConstByDifficulty(c, difficulty) !== null);
    if (!hit) {
      // 曲名有，但该 type + 难度对不上
      // （含 DXRating 自身 sheet_type 与官方目录不符的情况，例如 DX-only 曲被标成 std）
      droppedMismatch++;
      continue;
    }

    const tag = tagById.get(ts.tag_id);
    if (!tag) continue;

    const chartKey = chartTagKey(hit.songId, difficulty);
    let seen = seenPerChart.get(chartKey);
    if (!seen) {
      seen = new Set<number>();
      seenPerChart.set(chartKey, seen);
    }
    if (seen.has(tag.id)) continue; // 同谱面同 tag 去重
    seen.add(tag.id);

    const arr = byChart.get(chartKey);
    if (arr) arr.push(tag);
    else byChart.set(chartKey, [tag]);

    resolved++;
    songIds.add(hit.songId);
  }

  // 每个谱面的 tag 按分组 + 关联强度排序，保证展示稳定
  for (const list of byChart.values()) {
    list.sort((a, b) => (a.groupId ?? 99) - (b.groupId ?? 99) || a.id - b.id);
  }

  const stats: TagCatalogStats = {
    totalAssociations: (payload.tagSongs ?? []).length,
    resolved,
    droppedNoSong,
    droppedMismatch,
    chartCount: byChart.size,
    songCount: songIds.size,
  };

  return {
    tags: [...tagById.values()],
    groups: [...groupById.values()].sort((a, b) => a.id - b.id),
    byChart,
    stats,
    fetchedAt: new Date().toISOString(),
  };
}

/** 取某谱面的 tag 列表（无则返回空数组） */
export function getTagsForChart(
  catalog: TagCatalog | null | undefined,
  songId: number,
  difficulty: string
): ChartTag[] {
  if (!catalog) return [];
  return catalog.byChart.get(chartTagKey(songId, difficulty)) ?? [];
}

/** 判断谱面是否带某个 tag id */
export function chartHasTag(
  catalog: TagCatalog | null | undefined,
  songId: number,
  difficulty: string,
  tagId: number
): boolean {
  return getTagsForChart(catalog, songId, difficulty).some(t => t.id === tagId);
}
