/**
 * 水鱼 `/chart_stats` —— 全服谱面统计（免鉴权）
 *
 * 端点：`GET https://www.diving-fish.com/api/maimaidxprober/chart_stats`
 *   ⚠️ 只有这一个路径正确，`/api/chart_stats` 等一律 404。
 *
 * 返回：`{ charts: { [songId]: ChartStat[5] }, diff_data: {...} }`
 *   **数组下标才是 level_index**，`diff` 字段是等级字符串（"12+"），不是下标。
 *
 * 用途：`peer_stats` 拿不到时的**降级基准**（路线 4 的方案 B）。
 *   - `水度 = ds − fit_diff`（官方定数 − 拟合定数，正值 = 比官标容易）
 *   - `avg` / `std_dev` → 「这张谱全服偏难/偏易」的粗判
 *   ⚠️ **全服不分段** → 此时 `peerStatsAvailable = false`，**禁止同段比较断言**。
 *
 * 纪律：本地缓存 + 静默降级。
 */
import { db } from './db';

const STATS_ENDPOINT = import.meta.env.DEV
  ? '/api-df/chart_stats'
  : 'https://www.diving-fish.com/api/maimaidxprober/chart_stats';

const CACHE_KEY = 'df_chart_stats_cache';
const CACHE_TS_KEY = 'df_chart_stats_ts';

/** 统计会随新曲上架缓慢变化，缓存 3 天 */
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface ChartStat {
  /** 样本量 */
  cnt: number;
  /** ⚠️ 等级字符串，如 "12+"，不是 level_index */
  diff: string;
  /** 拟合定数 */
  fit_diff: number;
  /** 平均达成率 */
  avg: number;
  avg_dx: number;
  /** 达成率标准差 */
  std_dev: number;
  /** 评级分布 */
  dist: number[];
  /** FC 分布 */
  fc_dist: number[];
}

export interface ChartStatsPayload {
  charts: Record<string, ChartStat[]>;
  diff_data?: unknown;
}

export interface ChartStatsCache {
  payload: ChartStatsPayload;
  fetchedAt: string;
  origin: 'network' | 'cache' | 'stale';
}

export async function readStatsCache(): Promise<{ payload: ChartStatsPayload; fetchedAt: string } | null> {
  try {
    const row = await db.appSettings.get(CACHE_KEY);
    if (!row?.value) return null;
    const ts = await db.appSettings.get(CACHE_TS_KEY);
    return { payload: JSON.parse(row.value) as ChartStatsPayload, fetchedAt: ts?.value ?? row.updatedAt };
  } catch {
    return null;
  }
}

async function writeStatsCache(payload: ChartStatsPayload): Promise<string> {
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
  return !Number.isNaN(t) && Date.now() - t < CACHE_TTL_MS;
}

export async function clearStatsCache(): Promise<void> {
  await db.appSettings.delete(CACHE_KEY);
  await db.appSettings.delete(CACHE_TS_KEY);
}

/**
 * 拉取全服谱面统计。
 * 顺序：新鲜缓存 → 网络 → 旧缓存 → null（静默降级）
 */
export async function fetchChartStats(forceRefresh = false): Promise<ChartStatsCache | null> {
  const cached = await readStatsCache();

  if (!forceRefresh && cached && isFresh(cached.fetchedAt)) {
    return { payload: cached.payload, fetchedAt: cached.fetchedAt, origin: 'cache' };
  }

  try {
    const resp = await fetch(STATS_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = (await resp.json()) as ChartStatsPayload;
    if (!payload?.charts) throw new Error('响应结构异常');
    const fetchedAt = await writeStatsCache(payload);
    return { payload, fetchedAt, origin: 'network' };
  } catch (err) {
    console.warn('[ChartStats] 拉取失败，尝试回退缓存:', err);
    if (cached) return { payload: cached.payload, fetchedAt: cached.fetchedAt, origin: 'stale' };
    return null;
  }
}

/** 取某谱面的全服统计 */
export function getChartStat(
  payload: ChartStatsPayload | null | undefined,
  songId: number,
  levelIndex: number
): ChartStat | null {
  if (!payload) return null;
  const arr = payload.charts?.[String(songId)];
  if (!Array.isArray(arr)) return null;
  const s = arr[levelIndex];
  if (!s || typeof s.cnt !== 'number') return null;
  return s;
}
