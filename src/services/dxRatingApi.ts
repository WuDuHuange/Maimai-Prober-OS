/**
 * DXRating 谱面 tag 数据源
 *
 * 端点：`GET https://miruku.dxrating.net/api/v1/tags`（公开免鉴权，约 652 KB）
 * 仓库：https://github.com/gekichumai/dxrating
 *
 * 纪律：
 * - **本地缓存 + 定期刷新**，不要每次启动都拉
 * - **拉不到就静默降级**，绝不阻塞 B50 / AI 主流程
 * - tag 是**社区标注**，产品文案不要写「官方」「共识」
 */
import { db } from './db';
import type { RawTagsResponse } from '@/types/tag';

/** 开发期走 vite proxy 规避 CORS，生产直连 */
const TAGS_ENDPOINT = import.meta.env.DEV
  ? '/api-dxr/api/v1/tags'
  : 'https://miruku.dxrating.net/api/v1/tags';

const CACHE_KEY = 'dxr_tags_cache';
const CACHE_TS_KEY = 'dxr_tags_cache_ts';

/** 缓存有效期：7 天。社区标注变动慢，没必要勤刷。 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RawTagCache {
  payload: RawTagsResponse;
  fetchedAt: string;
}

/** 读取本地缓存（不判断新鲜度） */
export async function readTagCache(): Promise<RawTagCache | null> {
  try {
    const row = await db.appSettings.get(CACHE_KEY);
    if (!row?.value) return null;
    const payload = JSON.parse(row.value) as RawTagsResponse;
    const tsRow = await db.appSettings.get(CACHE_TS_KEY);
    return { payload, fetchedAt: tsRow?.value ?? row.updatedAt };
  } catch {
    return null;
  }
}

async function writeTagCache(payload: RawTagsResponse): Promise<string> {
  const now = new Date().toISOString();
  try {
    await db.appSettings.put({ key: CACHE_KEY, value: JSON.stringify(payload), updatedAt: now });
    await db.appSettings.put({ key: CACHE_TS_KEY, value: now, updatedAt: now });
  } catch {
    /* 缓存写失败不影响主流程 */
  }
  return now;
}

function isFresh(fetchedAt: string | undefined): boolean {
  if (!fetchedAt) return false;
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < CACHE_TTL_MS;
}

/** 清空 tag 缓存（设置页「强制刷新」用） */
export async function clearTagCache(): Promise<void> {
  await db.appSettings.delete(CACHE_KEY);
  await db.appSettings.delete(CACHE_TS_KEY);
}

export interface FetchTagResult {
  payload: RawTagsResponse;
  fetchedAt: string;
  /** 'network' = 本次联网拉取；'cache' = 命中新鲜缓存；'stale' = 网络失败，回退旧缓存 */
  origin: 'network' | 'cache' | 'stale';
}

/**
 * 拉取 tag 目录。
 * 顺序：新鲜缓存 → 网络 → 旧缓存 → null（静默降级）
 */
export async function fetchTagCatalogPayload(forceRefresh = false): Promise<FetchTagResult | null> {
  const cached = await readTagCache();

  if (!forceRefresh && cached && isFresh(cached.fetchedAt)) {
    return { payload: cached.payload, fetchedAt: cached.fetchedAt, origin: 'cache' };
  }

  try {
    const resp = await fetch(TAGS_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = (await resp.json()) as RawTagsResponse;
    if (!payload?.tags || !payload?.tagSongs) throw new Error('响应结构异常');
    const fetchedAt = await writeTagCache(payload);
    return { payload, fetchedAt, origin: 'network' };
  } catch (err) {
    console.warn('[DXRating] 拉取失败，尝试回退缓存:', err);
    if (cached) return { payload: cached.payload, fetchedAt: cached.fetchedAt, origin: 'stale' };
    return null;
  }
}

/** 缓存时间戳（设置页展示用） */
export async function getTagCacheTime(): Promise<string | null> {
  try {
    const row = await db.appSettings.get(CACHE_TS_KEY);
    return row?.value ?? null;
  } catch {
    return null;
  }
}
