/**
 * B50 分析 Store —— 编排「基准数据 + tag + 算法」
 *
 * 职责：
 * 1. 按需加载水鱼 `/chart_stats`（全服基准）与 DXRating tag
 * 2. 调用 `analyzeB50()` 产出六维结果
 * 3. 把结果缓存成「分析快照」，供 AI 教练后续对话复用
 *
 * 所有数据源都是**可选**的：任何一个拿不到，分析仍会产出，
 * 只是对应维度标记为 `insufficient`。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { B50AnalysisResult } from '@/types/b50Analysis';
import { analyzeB50 } from '@/utils/b50Analysis';
import { fetchChartStats, clearStatsCache, type ChartStatsPayload } from '@/services/chartStatsApi';
import { clearTagCache } from '@/services/dxRatingApi';
import { useB50Store } from './useB50Store';
import { useSongStore } from './useSongStore';
import { usePlayerStore } from './usePlayerStore';
import { useTagStore } from './useTagStore';

export const useAnalysisStore = defineStore('analysis', () => {
  const result = ref<B50AnalysisResult | null>(null);
  const statsPayload = ref<ChartStatsPayload | null>(null);
  const isAnalyzing = ref(false);
  const statsOrigin = ref<'network' | 'cache' | 'stale' | null>(null);
  /** 上一次分析的失败原因（不阻塞 UI） */
  const lastError = ref<string | null>(null);

  const hasResult = computed(() => result.value !== null);

  /** 分析快照的文本摘要 —— 供 AI 上下文与卡片展示 */
  const headline = computed(() => result.value?.headline ?? '');

  /**
   * 加载基准统计（幂等，可重复调用）
   */
  async function ensureStats(force = false) {
    if (statsPayload.value && !force) return;
    const r = await fetchChartStats(force);
    if (r) {
      statsPayload.value = r.payload;
      statsOrigin.value = r.origin;
    }
  }

  /**
   * 执行完整分析。
   * @param force 强制刷新基准与 tag 数据
   */
  async function runAnalysis(force = false): Promise<B50AnalysisResult | null> {
    if (isAnalyzing.value) return result.value;

    isAnalyzing.value = true;
    lastError.value = null;
    try {
      const b50Store = useB50Store();
      const songStore = useSongStore();
      const tagStore = useTagStore();

      // 1) B50（已按谱面归并）
      if (b50Store.b50List.length === 0) await b50Store.loadFromDB();

      // 2) 曲库
      if (songStore.songs.size === 0) await songStore.loadFromDB();

      if (b50Store.b50List.length === 0) {
        lastError.value = '没有 B50 数据，请先同步战绩';
        return null;
      }

      // 3) 基准 + tag —— 并行，各自独立降级
      await Promise.all([
        ensureStats(force).catch(() => {}),
        tagStore.load(force).catch(() => {}),
      ]);

      // 4) 分析
      result.value = analyzeB50({
        b50List: b50Store.b50List,
        songMap: songStore.songs,
        tagCatalog: tagStore.catalog,
        statsPayload: statsPayload.value,
        playerRating: usePlayerStore().currentRating,
        playerName: usePlayerStore().playerName,
      });

      return result.value;
    } catch (e: any) {
      lastError.value = e?.message ?? '分析失败';
      console.warn('[Analysis] 分析失败:', e);
      return null;
    } finally {
      isAnalyzing.value = false;
    }
  }

  /** 清空结果（清空对话 / 重新同步时调用） */
  function reset() {
    result.value = null;
    lastError.value = null;
  }

  /** 强制刷新全部数据源（清基准缓存 + 清 tag 缓存 + 重建 tag join） */
  async function refreshAll() {
    await Promise.all([clearStatsCache(), clearTagCache()]);
    statsPayload.value = null;
    useTagStore().catalog = null;
    await runAnalysis(true);
  }

  return {
    result, statsPayload, isAnalyzing, statsOrigin, lastError,
    hasResult, headline,
    ensureStats, runAnalysis, reset, refreshAll,
  };
});
