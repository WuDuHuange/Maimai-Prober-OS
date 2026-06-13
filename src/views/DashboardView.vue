<template>
  <div class="dashboard p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <!-- Player Card -->
    <div class="card player-card">
      <div class="flex items-start gap-4">
        <div class="avatar-lg" />
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-lg font-bold">{{ playerStore.playerName }}</span>
          </div>
          <div class="flex items-end gap-6 mt-3">
            <div>
              <span class="text-xs text-text-muted">Rating</span>
              <div class="rating-big">{{ playerStore.currentRating.toFixed(2) }}</div>
            </div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-xs text-text-muted">同步记录数</span>
          <div class="rank-text">{{ playLogStore.totalCount.toLocaleString() }}</div>
        </div>
      </div>
    </div>

    <!-- B50 Card Grid -->
    <div id="b50-section" class="card-static p-5">
      <div class="flex items-center justify-between mb-4">
        <span class="section-title-sm">Best 50 排名</span>
        <span class="text-xs text-text-muted">Rating 贡献排序 · 悬停查看详情</span>
      </div>
      <B50CardGrid />
    </div>

    <!-- Stats Bar -->
    <div id="stats-section" class="card-static stats-bar">
      <div v-for="st in statsItems" :key="st.label" class="stat-item">
        <span class="st-label">{{ st.label }}</span>
        <span class="st-num">{{ st.value }}</span>
        <span class="st-change up">{{ st.change }}</span>
      </div>
    </div>

    <!-- Weekly Report -->
    <div id="weekly-section" class="card-static p-5">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <span class="section-title-sm">极客周报</span>
          <span class="text-xs text-text-muted">{{ weekRange }}</span>
        </div>
        <span class="text-lg text-text-muted cursor-pointer flex items-center">&gt;</span>
      </div>
      <div class="grid grid-cols-5 gap-3">
        <div class="weekly-stat-card">
          <div class="ws-icon blue">P</div>
          <div class="ws-content">
            <span class="ws-label">游玩次数</span>
            <span class="ws-val">{{ weeklyStats.plays }}</span>
          </div>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon cyan">N</div>
          <div class="ws-content">
            <span class="ws-label">新增谱面</span>
            <span class="ws-val">{{ weeklyStats.newSongs }}</span>
          </div>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon purple">S</div>
          <div class="ws-content">
            <span class="ws-label">单曲最高</span>
            <span class="ws-val">{{ weeklyStats.bestScore.toFixed(2) }}%</span>
          </div>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon yellow">R</div>
          <div class="ws-content">
            <span class="ws-label">Rating 变动</span>
            <span class="ws-val rating-up">+{{ weeklyStats.ratingChange.toFixed(0) }}</span>
          </div>
        </div>
        <div class="weekly-stat-card">
          <div class="ws-icon green">A</div>
          <div class="ws-content">
            <span class="ws-label">平均达成</span>
            <span class="ws-val">{{ weeklyStats.avgAch.toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Action Bar -->
    <div class="fab-bar">
      <button class="fab-btn active" @click="scrollTo('b50-section')">全景 B50</button>
      <button class="fab-btn" @click="scrollTo('stats-section')">数据统计</button>
      <button class="fab-btn" @click="scrollTo('weekly-section')">周报概况</button>
      <button class="fab-btn" @click="exportData">导出数据</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import B50CardGrid from '@/components/b50/B50CardGrid.vue';

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

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportData() {
  const data = {
    b50: useB50Store().b50List,
    records: usePlayLogStore().records,
    player: usePlayerStore().profile,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maimai-data-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  await playLogStore.loadFromDB();
  await b50Store.loadFromDB();
});
</script>

<style scoped>
.dashboard { padding: 20px; gap: 20px; }

.player-card {
  padding: 24px;
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--transition-smooth), transform var(--transition-smooth);
}
.player-card:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
}

.avatar-lg {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(74, 114, 255, 0.2);
}

.rating-big {
  font-size: 40px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: var(--letter-spacing-tight);
}

.rating-up { color: var(--color-success); font-size: 13px; font-weight: 600; }

.rank-text {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-title-sm {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: var(--letter-spacing-normal);
}

/* ===== Stats Bar ===== */
.stats-bar { display: flex; padding: 20px 28px; gap: 8px; }
.stat-item {
  flex: 1; text-align: center;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  transition: background 0.2s ease, transform 0.2s ease;
}
.stat-item:hover {
  background: var(--bg-hover);
  transform: translateY(-1px);
}
.st-label { font-size: 11px; color: var(--text-muted); display: block; letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.st-num { font-size: 24px; font-weight: 700; color: var(--text-primary); display: block; margin: 6px 0 2px; letter-spacing: var(--letter-spacing-tight); }
.st-change { font-size: 11px; font-weight: 600; }
.st-change.up { color: var(--color-success); }

/* ===== Weekly Report Cards ===== */
.weekly-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 16px 12px 14px;
  min-height: 120px;
  background: var(--bg-body);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.3s ease, background 0.3s ease;
  cursor: default;
}
.weekly-stat-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 16px 40px rgba(44, 76, 160, 0.08);
  border-color: rgba(255, 255, 255, 0.8);
  background: white;
}

.ws-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(0,0,0,0.1);
  margin-bottom: auto;
}

.ws-icon.blue   { background: linear-gradient(135deg, #4A72FF 0%, #7B9AFF 100%); box-shadow: 0 3px 12px rgba(74,114,255,0.25); }
.ws-icon.cyan   { background: linear-gradient(135deg, #06B6D4 0%, #3BC9DB 100%); box-shadow: 0 3px 12px rgba(6,182,212,0.25); }
.ws-icon.purple { background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%); box-shadow: 0 3px 12px rgba(139,92,246,0.25); }
.ws-icon.yellow { background: linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%); box-shadow: 0 3px 12px rgba(245,158,11,0.25); }
.ws-icon.green  { background: linear-gradient(135deg, #10B981 0%, #34D399 100%); box-shadow: 0 3px 12px rgba(16,185,129,0.25); }

.ws-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: 12px;
}

.ws-label { font-size: 11px; color: var(--text-muted); font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; }
.ws-val { font-size: 18px; font-weight: 800; color: var(--text-primary); letter-spacing: var(--letter-spacing-tight); line-height: 1; }
.ws-val.rating-up { color: var(--color-success); }

/* ===== FAB Bar — 浮动操作栏 ===== */
.fab-bar {
  display: flex;
  gap: 4px;
  padding: 6px;
  background: white;
  border-radius: 24px;
  box-shadow: var(--shadow-fab);
  width: fit-content;
  margin: 0 auto;
  border: 1px solid var(--border-color-light);
}

.fab-btn {
  padding: 10px 20px;
  border-radius: 20px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all var(--transition-smooth);
  white-space: nowrap;
  letter-spacing: var(--letter-spacing-normal);
}

.fab-btn.active {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: white;
  font-weight: 600;
  box-shadow: 0 3px 12px rgba(74, 114, 255, 0.25);
}

.fab-btn:hover:not(.active) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
