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
import type { AbilitySnapshot } from '@/types/b50History';
import type { B50Record } from '@/types/b50';
import { analyzeB50 } from '@/utils/b50Analysis';
import { fetchChartStats, clearStatsCache, type ChartStatsPayload } from '@/services/chartStatsApi';
import { clearTagCache } from '@/services/dxRatingApi';
import { useB50Store } from './useB50Store';
import { useSongStore } from './useSongStore';
import { usePlayerStore } from './usePlayerStore';
import { useTagStore } from './useTagStore';
import { usePlayLogStore } from './usePlayLogStore';
import { useB50HistoryStore } from './useB50HistoryStore';
import { b50Fingerprint, buildAbilitySnapshot } from '@/services/b50HistoryService';

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
      const playLogStore = usePlayLogStore();

      // 1) B50（已按谱面归并）
      if (b50Store.b50List.length === 0) await b50Store.loadFromDB();

      // 2) 曲库
      if (songStore.songs.size === 0) await songStore.loadFromDB();

      // 3) 全量成绩 —— 硬度维度需要看 B50 之外的硬谱表现
      //    （B50 只收最好的 50 首，硬谱天然被挤出，只看 B50 会零区分度）
      if (playLogStore.records.length === 0) await playLogStore.loadFromDB();

      if (b50Store.b50List.length === 0) {
        lastError.value = '没有 B50 数据，请先同步战绩';
        return null;
      }

      // 4) 基准 + tag —— 并行，各自独立降级
      await Promise.all([
        ensureStats(force).catch(() => {}),
        tagStore.load(force).catch(() => {}),
      ]);

      // 5) 分析
      const analysis = analyzeB50({
        b50List: b50Store.b50List,
        songMap: songStore.songs,
        tagCatalog: tagStore.catalog,
        statsPayload: statsPayload.value,
        playerRating: usePlayerStore().currentRating,
        playerName: usePlayerStore().playerName,
        allPlays: playLogStore.records,
      });
      result.value = analysis;

      // 6) 把六维指纹挂到「与当前 B50 内容一致」的历史快照上。
      //    历史 B50 无法重算六维（硬度依赖当时的全量成绩），所以只能存当时的分析结果。
      //    失败不影响分析本身 —— 缺指纹时对比页会退化成「只对比结构」。
      try {
        const historyStore = useB50HistoryStore();
        if (historyStore.entries.length === 0) await historyStore.load();
        const fingerprint = b50Fingerprint(b50Store.b50List);
        const ability = buildAbilitySnapshot(analysis);
        if (!(await historyStore.attach(fingerprint, ability))) {
          // 没有对应快照：老用户升级前就已有 B50，但历史表是空的。
          // 先补一份当前基线，再把六维挂上去（否则这次分析会白跑，对比页没有六维）。
          const rating = usePlayerStore().currentRating || b50Store.computedRating;
          if (await historyStore.capture(b50Store.b50List, rating, 'bootstrap')) {
            await historyStore.attach(fingerprint, ability);
          }
        }
      } catch (e) {
        console.warn('[B50History] 能力指纹附加失败（不影响分析）:', e);
      }

      return analysis;
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

  /**
   * 用**指定的一份 B50** 重算六维（历史快照补算用）。
   *
   * 与 `runAnalysis` 共用同一套数据源，区别只在 b50List 的来源。
   *
   * @param estimated 标记「事后补算」。硬度依赖全量成绩做同定数分箱对照，
   *                  而历史全量成绩无法回放 —— 补算历史快照时对照池是今天的。
   *                  其余五维只吃这份 B50，补算值与当时一致。
   *                  同步后立即补算**不要**传 true（全量成绩就是刚同步的）。
   */
  async function computeAbilityFor(
    records: B50Record[],
    opts: { estimated?: boolean } = {},
  ): Promise<AbilitySnapshot | null> {
    if (records.length === 0) return null;

    const songStore = useSongStore();
    const tagStore = useTagStore();
    const playLogStore = usePlayLogStore();
    if (songStore.songs.size === 0) await songStore.loadFromDB();
    if (playLogStore.records.length === 0) await playLogStore.loadFromDB();
    // 基准与 tag 都是可选的：拿不到时对应维度标 insufficient，其余照常
    await Promise.all([
      ensureStats(false).catch(() => {}),
      tagStore.load(false).catch(() => {}),
    ]);

    // ⚠️ 没有全服基准时硬度只能取中性 50（insufficient）。实时展示无所谓，
    //    但写进历史快照就会变成「当时硬度 50」的假结论 —— 宁可失败让用户重试。
    if (!statsPayload.value) return null;

    const r = analyzeB50({
      b50List: records,
      songMap: songStore.songs,
      tagCatalog: tagStore.catalog,
      statsPayload: statsPayload.value,
      playerRating: usePlayerStore().currentRating,
      playerName: usePlayerStore().playerName,
      allPlays: playLogStore.records,
    });
    return buildAbilitySnapshot(r, opts.estimated === true);
  }

  /**
   * 给所有缺六维的历史快照补算。
   *
   * 老用户升级前的快照、以及「同步后没再分析」的快照都会缺 ——
   * 不补的话对比页永远只能比结构，判定恒为 unknown。
   *
   * @returns 实际补上的份数
   */
  async function backfillHistoryAbility(): Promise<number> {
    const historyStore = useB50HistoryStore();
    if (historyStore.entries.length === 0) await historyStore.load();

    const missing = historyStore.entries.filter(e => !e.ability);
    if (missing.length === 0) return 0;

    const b50Store = useB50Store();
    if (b50Store.b50List.length === 0) await b50Store.loadFromDB();
    // 与当前 B50 内容一致的快照 = 就是「现在」，全量成绩也是现在的 → 不算补算
    const currentFp = b50Store.b50List.length > 0 ? b50Fingerprint(b50Store.b50List) : null;

    let done = 0;
    for (const entry of missing) {
      const ability = await computeAbilityFor(entry.records, {
        estimated: entry.fingerprint !== currentFp,
      });
      if (ability && (await historyStore.attach(entry.fingerprint, ability))) done += 1;
    }
    return done;
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
    computeAbilityFor, backfillHistoryAbility,
  };
});
