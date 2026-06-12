<template>
  <div class="weekly-view p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <h1 class="text-lg font-bold text-text-primary">数据总览</h1>

    <div ref="cardsContainer" class="grid grid-cols-2 gap-3">
      <div class="stat-card"><span class="stat-label">总游玩次数</span><span class="stat-value">{{ stats.totalPlays }}</span></div>
      <div class="stat-card"><span class="stat-label">游玩曲目数</span><span class="stat-value">{{ stats.uniqueSongs }}</span></div>
      <div class="stat-card"><span class="stat-label">平均达成率</span><span class="stat-value">{{ stats.avgAchievements }}%</span></div>
      <div class="stat-card"><span class="stat-label">最高达成率</span><span class="stat-value text-accent">{{ stats.bestAchievements }}%</span></div>
      <div class="stat-card"><span class="stat-label">SSS+ 次数</span><span class="stat-value">{{ stats.sssPlusCount }}</span></div>
      <div class="stat-card"><span class="stat-label">FC/AP 次数</span><span class="stat-value">{{ stats.fcCount }}</span></div>
      <div class="stat-card col-span-2"><span class="stat-label">最佳曲目</span><span class="stat-value text-sm">{{ stats.bestSong }}</span></div>
    </div>

    <p v-if="noData" class="text-text-muted text-sm text-center py-8">暂无游玩数据, 请先同步</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { useGSAP } from '@/composables/useGSAP';

const playLogStore = usePlayLogStore();
const songStore = useSongStore();
const { staggerIn } = useGSAP();
const cardsContainer = ref<HTMLElement | null>(null);
const noData = ref(true);
const stats = ref({
  totalPlays: 0, uniqueSongs: 0, avgAchievements: 0, bestAchievements: 0,
  sssPlusCount: 0, fcCount: 0, bestSong: '-',
});

onMounted(async () => {
  await playLogStore.loadFromDB();
  const records = playLogStore.records;
  if (records.length === 0) return;

  noData.value = false;
  const songIds = new Set(records.map(r => r.songId));
  const avgAch = records.reduce((s, r) => s + r.achievements, 0) / records.length;
  const bestAch = Math.max(...records.map(r => r.achievements));
  const sssPlus = records.filter(r => r.achievements >= 100.5).length;
  const fcCount = records.filter(r => r.fcStatus === 'fc' || r.fcStatus === 'ap').length;

  const best = records.reduce((a, b) => a.achievements > b.achievements ? a : b);
  const song = await songStore.getSong(best.songId);

  stats.value = {
    totalPlays: records.length,
    uniqueSongs: songIds.size,
    avgAchievements: parseFloat(avgAch.toFixed(2)),
    bestAchievements: parseFloat(bestAch.toFixed(2)),
    sssPlusCount: sssPlus,
    fcCount,
    bestSong: `${song?.title ?? '未知'} [${best.difficulty.toUpperCase()}] ${best.achievements.toFixed(2)}%`,
  };

  await nextTick();
  if (cardsContainer.value) staggerIn(cardsContainer.value.children as unknown as Element[]);
});
</script>

<style scoped>
.stat-card { background: var(--bg-secondary); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-sm); }
.stat-label { font-size: 11px; color: var(--text-muted); }
.stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); }
</style>
