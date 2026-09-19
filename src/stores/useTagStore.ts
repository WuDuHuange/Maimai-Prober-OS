/**
 * 谱面 tag Store —— DXRating 社区标注
 *
 * 纪律：**拉不到就静默降级**。`catalog` 为 null 时所有查询返回空数组，
 *       UI 显示「暂无标注」而不是报错，AI 上下文里也不注入 tag 段。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChartTag, TagCatalog } from '@/types/tag';
import { fetchTagCatalogPayload, clearTagCache } from '@/services/dxRatingApi';
import { resolveTagCatalog, getTagsForChart } from '@/utils/tagResolver';
import { useSongStore } from './useSongStore';

export const useTagStore = defineStore('tag', () => {
  const catalog = ref<TagCatalog | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  /** 'network' | 'cache' | 'stale' —— 用于设置页展示数据新鲜度 */
  const origin = ref<'network' | 'cache' | 'stale' | null>(null);

  const isReady = computed(() => catalog.value !== null);
  const stats = computed(() => catalog.value?.stats ?? null);

  /** 按分组聚合的 tag 列表（设置页 / 图例用） */
  const tagsByGroup = computed(() => {
    const c = catalog.value;
    if (!c) return [];
    return c.groups.map(g => ({
      ...g,
      tags: c.tags.filter(t => t.groupId === g.id),
    }));
  });

  /**
   * 加载 tag 目录。已有数据且非强制刷新时直接返回。
   * @param force 强制联网刷新（跳过新鲜缓存）
   */
  async function load(force = false) {
    if (isLoading.value) return;
    if (catalog.value && !force) return;

    isLoading.value = true;
    error.value = null;
    try {
      const songStore = useSongStore();
      if (songStore.songs.size === 0) {
        await songStore.loadFromDB();
      }
      // 曲库为空 → 无从 join，静默跳过（不报错，等曲库就绪后再来）
      if (songStore.songs.size === 0) return;

      const result = await fetchTagCatalogPayload(force);
      if (!result) {
        // 网络与缓存都不可用 → 静默降级
        error.value = '标签数据暂不可用';
        return;
      }

      catalog.value = resolveTagCatalog(result.payload, songStore.songs.values());
      catalog.value.fetchedAt = result.fetchedAt;
      origin.value = result.origin;
    } catch (e: any) {
      // 任何异常都不应影响主流程
      error.value = e?.message ?? '标签数据加载失败';
      console.warn('[TagStore] 加载失败（已降级）:', e);
    } finally {
      isLoading.value = false;
    }
  }

  /** 强制刷新（清缓存后重新拉取） */
  async function refresh() {
    await clearTagCache();
    catalog.value = null;
    await load(true);
  }

  /** 查某谱面的 tag */
  function getTags(songId: number, difficulty: string): ChartTag[] {
    return getTagsForChart(catalog.value, songId, difficulty);
  }

  /** 曲库变更（重新同步）后重建 join 索引 */
  async function rebuild() {
    if (!catalog.value) return;
    // 已有原始 payload 时无需重新联网：直接清空后走 load 会命中新鲜缓存
    catalog.value = null;
    await load(false);
  }

  return {
    catalog, isLoading, error, origin,
    isReady, stats, tagsByGroup,
    load, refresh, getTags, rebuild,
  };
});
