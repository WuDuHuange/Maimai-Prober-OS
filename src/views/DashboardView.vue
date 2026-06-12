<template>
  <div class="dashboard p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <!-- Player Card -->
    <div class="card player-card">
      <div class="flex items-start gap-4">
        <div class="avatar-lg" />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-lg font-bold">{{ playerStore.playerName }}</span>
            <span class="text-xs text-text-muted">ID: {{ playerStore.currentRating }}</span>
          </div>
          <div class="flex items-end gap-6 mt-3">
            <div>
              <span class="text-xs text-text-muted">Rating</span>
              <div class="rating-big">{{ playerStore.currentRating.toFixed(2) }}</div>
            </div>
            <div class="flex items-center gap-1 mb-1">
              <span class="rating-up">+38.47</span>
            </div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-xs text-text-muted">全球排名</span>
          <div class="rank-text">#1,248</div>
          <span class="text-xs text-text-muted">Top 2.351%</span>
        </div>
      </div>
    </div>

    <!-- B50 Constant Distribution -->
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <span class="section-title-sm">B50 定数分布</span>
      </div>
      <div style="height:240px">
        <B50DistributionChart />
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="card stats-bar">
      <div v-for="st in statsItems" :key="st.label" class="stat-item">
        <span class="st-label">{{ st.label }}</span>
        <span class="st-num">{{ st.value }}</span>
        <span class="st-change up">{{ st.change }}</span>
      </div>
    </div>

    <!-- Weekly Report -->
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="section-title-sm">极客周报</span>
          <span class="text-xs text-text-muted ml-2">{{ weekRange }}</span>
        </div>
        <span class="text-lg text-text-muted cursor-pointer">&gt;</span>
      </div>
      <div class="grid grid-cols-5 gap-3">
        <div class="weekly-stat-card">
          <div class="ws-icon blue">P</div>
          <span class="ws-label">游玩次数</span>
          <span class="ws-val">{{ weeklyStats.plays }}</span>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon cyan">N</div>
          <span class="ws-label">新增谱面</span>
          <span class="ws-val">{{ weeklyStats.newSongs }}</span>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon purple">S</div>
          <span class="ws-label">单曲最高</span>
          <span class="ws-val">{{ weeklyStats.bestScore.toFixed(1) }}%</span>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon yellow">R</div>
          <span class="ws-label">Rating 变动</span>
          <span class="ws-val rating-up">+{{ weeklyStats.ratingChange.toFixed(0) }}</span>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon green">A</div>
          <span class="ws-label">平均达成率</span>
          <span class="ws-val">{{ weeklyStats.avgAch.toFixed(1) }}%</span>
        </div>
      </div>
    </div>

    <!-- Floating Action Bar -->
    <div class="fab-bar">
      <button v-for="btn in fabBtns" :key="btn.key" class="fab-btn" :class="{ active: btn.active }" @click="btn.active = !btn.active">
        {{ btn.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import B50DistributionChart from '@/components/charts/B50DistributionChart.vue';

const playerStore = usePlayerStore();
const playLogStore = usePlayLogStore();
const b50Store = useB50Store();

const weekRange = computed(() => {
  const d = new Date();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${mon.getMonth()+1}/${mon.getDate()} - ${sun.getMonth()+1}/${sun.getDate()}`;
});

const statsItems = computed(() => {
  const records = playLogStore.records;
  const total = records.length || 0;
  const avg = total > 0 ? records.reduce((s, r) => s + r.achievements, 0) / total : 0;
  const sssPlus = records.filter(r => r.achievements >= 100.5).length;
  const fcCount = records.filter(r => r.fcStatus === 'fc' || r.fcStatus === 'ap').length;
  const rt = b50Store.b50List.reduce((s, b) => s + (b.ratingContribution || 0), 0);

  return [
    { label: '总游玩次数', value: total.toLocaleString(), change: '' },
    { label: '理论值(R.T.)', value: rt.toFixed(2), change: '' },
    { label: '平均达成率', value: avg.toFixed(2) + '%', change: '' },
    { label: 'SSS+ 次数', value: String(sssPlus), change: '' },
    { label: 'Full Combo', value: String(fcCount), change: '' },
  ];
});

const weeklyStats = computed(() => {
  const records = playLogStore.records;
  const avg = records.length > 0 ? records.reduce((s, r) => s + r.achievements, 0) / records.length : 0;
  const best = records.length > 0 ? Math.max(...records.map(r => r.achievements)) : 0;
  return {
    plays: records.length,
    newSongs: new Set(records.map(r => r.songId)).size,
    bestScore: best,
    ratingChange: playerStore.currentRating,
    avgAch: avg,
  };
});

const fabBtns = ref([
  { key: 'b50', label: '全景 B50', active: true },
  { key: 'analysis', label: '成绩分析', active: false },
  { key: 'compare', label: '对比工具', active: false },
  { key: 'export', label: '导出数据', active: false },
  { key: 'more', label: '更多工具', active: false },
]);

onMounted(async () => {
  await playLogStore.loadFromDB();
  await b50Store.loadFromDB();
});
</script>

<style scoped>
.dashboard { padding: 16px; gap: 16px; }

.player-card { padding: 20px; }
.avatar-lg {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  flex-shrink: 0;
}

.rating-big { font-size: 36px; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
.rating-up { color: var(--color-success); font-size: 13px; font-weight: 600; }
.rank-text { font-size: 20px; font-weight: 700; color: var(--text-primary); }

.section-title-sm { font-size: 13px; font-weight: 600; color: var(--text-primary); }

.time-filters { display: flex; gap: 4px; }
.time-btn {
  padding: 4px 12px;
  border-radius: 16px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: var(--text-muted);
  transition: all 0.15s;
}
.time-btn.active { background: white; color: var(--color-primary); font-weight: 600; box-shadow: var(--shadow-sm); }

.stats-bar { display: flex; padding: 16px 24px; }
.stat-item { flex: 1; text-align: center; }
.st-label { font-size: 11px; color: var(--text-muted); display: block; }
.st-num { font-size: 22px; font-weight: 700; color: var(--text-primary); display: block; margin: 4px 0; }
.st-change { font-size: 11px; font-weight: 500; }
.st-change.up { color: var(--color-success); }

.weekly-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 12px;
}

.ws-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 700;
}

.ws-icon.blue { background: linear-gradient(135deg, #4A72FF, #81A0FF); }
.ws-icon.cyan { background: linear-gradient(135deg, #06B6D4, #22D3EE); }
.ws-icon.purple { background: linear-gradient(135deg, #8B5CF6, #A78BFA); }
.ws-icon.yellow { background: linear-gradient(135deg, #F59E0B, #FBBF24); }
.ws-icon.green { background: linear-gradient(135deg, #10B981, #34D399); }

.ws-label { font-size: 10px; color: var(--text-muted); }
.ws-val { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.ws-val.rating-up { color: var(--color-success); }

.fab-bar {
  display: flex;
  gap: 4px;
  padding: 6px;
  background: white;
  border-radius: 24px;
  box-shadow: var(--shadow-lg);
  width: fit-content;
  margin: 0 auto;
}

.fab-btn {
  padding: 8px 18px;
  border-radius: 20px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s;
  white-space: nowrap;
}

.fab-btn.active {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  box-shadow: 0 4px 12px rgba(74,114,255,0.3);
}

.fab-btn:hover:not(.active) { background: var(--bg-hover); }
</style>
