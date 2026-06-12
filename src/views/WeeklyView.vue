<template>
  <div class="weekly-view p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <h1 class="text-lg font-bold text-text-primary">周报</h1>

    <!-- 翻页导航 -->
    <div class="flex items-center gap-2">
      <button class="nav-btn" @click="prevWeek">上一周</button>
      <span class="text-sm text-text-secondary">{{ weekLabel }}</span>
      <button class="nav-btn" @click="nextWeek">下一周</button>
    </div>

    <!-- 统计卡片 -->
    <div ref="cardsContainer" class="grid grid-cols-2 gap-3">
      <div class="stat-card">
        <span class="stat-label">出勤天数</span>
        <span class="stat-value" ref="dayCountEl">{{ stats.attendanceDays }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">游玩曲数</span>
        <span class="stat-value" ref="playCountEl">{{ stats.totalPlays }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">平均达成率</span>
        <span class="stat-value" ref="avgAchEl">{{ stats.avgAchievements.toFixed(1) }}%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">最高达成率</span>
        <span class="stat-value text-accent" ref="bestAchEl">{{ stats.bestAchievements.toFixed(2) }}%</span>
      </div>
      <div class="stat-card col-span-2">
        <span class="stat-label">Rating 变化</span>
        <span class="stat-value" :class="ratingChangeClass" ref="ratingEl">{{ ratingChangeText }}</span>
      </div>
    </div>

    <p v-if="noData" class="text-text-muted text-sm text-center py-4">该周暂无游玩记录</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { db } from '@/services/db';
import { useGSAP } from '@/composables/useGSAP';

const { staggerIn, pageFlip } = useGSAP();

const weekOffset = ref(0);
const cardsContainer = ref<HTMLElement | null>(null);
const stats = ref({ totalPlays: 0, attendanceDays: 0, avgAchievements: 0, bestAchievements: 0, ratingChange: 0 });
const noData = ref(true);

function getWeekRange(offset: number) {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

const weekLabel = computed(() => {
  const { start, end } = getWeekRange(weekOffset.value);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} - ${fmt(end)}`;
});

const ratingChangeText = computed(() => {
  const v = stats.value.ratingChange;
  return v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0);
});

const ratingChangeClass = computed(() => {
  const v = stats.value.ratingChange;
  return v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-text-secondary';
});

async function loadWeek() {
  const { start, end } = getWeekRange(weekOffset.value);
  const allRecords = await db.playLogs
    .where('playTime')
    .between(start.toISOString(), end.toISOString(), true, true)
    .toArray();

  if (allRecords.length === 0) {
    noData.value = true;
    stats.value = { totalPlays: 0, attendanceDays: 0, avgAchievements: 0, bestAchievements: 0, ratingChange: 0 };
    return;
  }

  noData.value = false;
  const days = new Set(allRecords.map(r => r.playTime.slice(0, 10)));
  const avgAch = allRecords.reduce((s, r) => s + r.achievements, 0) / allRecords.length;
  const bestAch = Math.max(...allRecords.map(r => r.achievements));
  const firstRating = allRecords[0]?.ratingBefore ?? 0;
  const lastRating = allRecords[allRecords.length - 1]?.ratingAfter ?? 0;

  stats.value = {
    totalPlays: allRecords.length,
    attendanceDays: days.size,
    avgAchievements: avgAch,
    bestAchievements: bestAch,
    ratingChange: lastRating - firstRating,
  };

  await nextTick();
  if (cardsContainer.value) {
    staggerIn(cardsContainer.value.children as unknown as Element[]);
  }
}

watch(weekOffset, () => {
  loadWeek();
  if (cardsContainer.value) {
    pageFlip(cardsContainer.value, weekOffset.value > (weekOffset.value - 1) ? 'next' : 'prev');
  }
});

function prevWeek() { weekOffset.value--; }
function nextWeek() { weekOffset.value++; }

onMounted(loadWeek);
</script>

<style scoped>
.nav-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid var(--bg-hover);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.nav-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.stat-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}
</style>
