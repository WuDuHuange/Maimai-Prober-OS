<template>
  <div ref="rootEl" class="stats-view">
    <header class="page-head">
      <div>
        <h1 class="page-title">数据总览</h1>
        <p class="page-sub">基于本地同步成绩的纯统计，不消耗 AI 额度</p>
      </div>
      <div class="freshness" :class="freshness.tone">
        <span class="dot" />
        {{ freshness.text }}
      </div>
    </header>

    <p v-if="noData" class="empty-state">暂无游玩数据，请先在首页点击「同步数据」</p>

    <template v-else>
      <!-- ① 核心指标 -->
      <section class="card-grid">
        <div v-for="s in headline" :key="s.label" class="stat-card">
          <span class="stat-label">{{ s.label }}</span>
          <span class="stat-value">
            <span class="num" :data-count="s.count" :data-decimals="s.decimals" :data-fmt="s.fmt">{{ s.value }}</span><i v-if="s.unit">{{ s.unit }}</i>
          </span>
          <span class="stat-hint">{{ s.hint }}</span>
        </div>
      </section>

      <p class="caliber-note">
        <b>统计口径</b>：同一谱面（曲目 + 难度）反复刷新会保留多行历史记录，
        因此「游玩记录」是历史行数，其余指标均已<b>按谱面归并</b>（每谱面只取最好的一次）。
      </p>

      <p class="best-line">
        <span class="best-label">最佳曲目</span>
        <span class="best-value">{{ bestSongLabel }}</span>
      </p>

      <!-- ② 难度分布 -->
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">难度分布</span>
          <span class="panel-hint">按谱面去重 · 共 {{ charts.length }} 张</span>
        </div>
        <div class="bar-list">
          <div v-for="(d, i) in diffDist" :key="d.key" class="bar-row" :style="{ '--d': i }">
            <span class="bar-name" :class="'diff-' + d.key">{{ d.label }}</span>
            <span class="bar-track">
              <span class="bar-fill" :class="'diff-' + d.key" :style="{ width: d.pct + '%' }" />
            </span>
            <span class="bar-num">{{ d.count }}</span>
            <span class="bar-pct">{{ d.pct.toFixed(1) }}%</span>
          </div>
        </div>
      </section>

      <!-- ③ 达成率档位 -->
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">达成率档位</span>
          <span class="panel-hint">按谱面最优成绩</span>
        </div>
        <div class="bar-list">
          <div v-for="(t, i) in tierDist" :key="t.label" class="bar-row" :style="{ '--d': i }">
            <span class="bar-name tier">{{ t.label }}</span>
            <span class="bar-track">
              <span class="bar-fill tier-fill" :style="{ width: t.pct + '%', background: t.color }" />
            </span>
            <span class="bar-num">{{ t.count }}</span>
            <span class="bar-pct">{{ t.pct.toFixed(1) }}%</span>
          </div>
        </div>
      </section>

      <!-- ④ 游玩密度 -->
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">游玩跨度</span>
          <span class="panel-hint">按记录时间</span>
        </div>
        <div class="span-grid">
          <div class="span-cell">
            <span class="span-num">{{ span.days }}</span>
            <span class="span-label">天</span>
          </div>
          <div class="span-cell">
            <span class="span-num">{{ span.activeDays }}</span>
            <span class="span-label">有记录的天数</span>
          </div>
          <div class="span-cell">
            <span class="span-num">{{ span.perDay }}</span>
            <span class="span-label">活跃日均谱面</span>
          </div>
          <div class="span-cell">
            <span class="span-num">{{ span.lastPlay }}</span>
            <span class="span-label">最近游玩</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useSongStore } from '@/stores/useSongStore';
import { useGSAP } from '@/composables/useGSAP';
import { collapseByChart } from '@/utils/b50Collapse';
import { DIFFICULTY_LABEL } from '@/types/song';
import type { DifficultyType } from '@/types/song';

const playLogStore = usePlayLogStore();
const songStore = useSongStore();
const { staggerIn, countUp } = useGSAP();

const rootEl = ref<HTMLElement | null>(null);
const noData = ref(true);
const bestSongLabel = ref('-');

/** 归并后的谱面（每谱面只保留最好一次）—— 除「游玩记录」外所有指标都用它 */
const charts = computed(() => collapseByChart(playLogStore.records));

const avgAch = computed(() => {
  const c = charts.value;
  return c.length ? c.reduce((s, r) => s + r.achievements, 0) / c.length : 0;
});

const bestAch = computed(() => {
  const c = charts.value;
  return c.length ? Math.max(...c.map(r => r.achievements)) : 0;
});

const headline = computed(() => {
  const c = charts.value;
  const birdPlus = c.filter(r => r.achievements >= 100.5).length;
  const fc = c.filter(r => r.fcStatus === 'fc' || r.fcStatus === 'ap').length;
  return [
    { label: '谱面总数', value: String(c.length), count: c.length, decimals: 0, fmt: 'int', hint: '曲目 + 难度去重', unit: '' },
    { label: '游玩记录', value: playLogStore.records.length.toLocaleString(), count: playLogStore.records.length, decimals: 0, fmt: 'locale', hint: '含历史刷新行', unit: '' },
    { label: '平均达成率', value: avgAch.value.toFixed(2), count: avgAch.value, decimals: 2, fmt: '', hint: '按谱面最优', unit: '%' },
    { label: '最高达成率', value: bestAch.value.toFixed(2), count: bestAch.value, decimals: 2, fmt: '', hint: '单谱最好成绩', unit: '%' },
    { label: 'SSS+ 谱面', value: String(birdPlus), count: birdPlus, decimals: 0, fmt: 'int', hint: '达成率 ≥ 100.5%', unit: '' },
    { label: 'FC / AP 谱面', value: String(fc), count: fc, decimals: 0, fmt: 'int', hint: '全连 / 全完美', unit: '' },
  ];
});

const diffDist = computed(() => {
  const order: DifficultyType[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];
  const total = charts.value.length || 1;
  return order.map(key => {
    const count = charts.value.filter(r => r.difficulty === key).length;
    return {
      key,
      label: DIFFICULTY_LABEL[key] ?? key,
      count,
      pct: (count / total) * 100,
    };
  }).filter(d => d.count > 0);
});

/** maimai 达成率档位（从高到低） */
const TIERS: Array<{ label: string; min: number; color: string }> = [
  { label: 'SSS+', min: 100.5, color: 'linear-gradient(90deg,#F59E0B,#FBBF24)' },
  { label: 'SSS', min: 100.0, color: 'linear-gradient(90deg,#8B5CF6,#A78BFA)' },
  { label: 'SS+', min: 99.5, color: 'linear-gradient(90deg,#4A72FF,#6B8CFF)' },
  { label: 'SS', min: 99.0, color: 'linear-gradient(90deg,#3B82F6,#60A5FA)' },
  { label: 'S+', min: 98.0, color: 'linear-gradient(90deg,#06B6D4,#22D3EE)' },
  { label: 'S', min: 97.0, color: 'linear-gradient(90deg,#10B981,#34D399)' },
  { label: 'A 及以下', min: 0, color: 'linear-gradient(90deg,#9CA3AF,#CBD5E1)' },
];

const tierDist = computed(() => {
  const c = charts.value;
  const total = c.length || 1;
  const out: Array<{ label: string; count: number; pct: number; color: string }> = [];
  let rest = [...c];
  for (const t of TIERS) {
    const hit = rest.filter(r => r.achievements >= t.min);
    rest = rest.filter(r => r.achievements < t.min);
    out.push({ label: t.label, count: hit.length, pct: (hit.length / total) * 100, color: t.color });
  }
  return out;
});

const span = computed(() => {
  const times = playLogStore.records
    .map(r => r.playTime)
    .filter(Boolean)
    .sort();
  if (!times.length) return { days: 0, activeDays: 0, perDay: 0, lastPlay: '-' };

  const first = new Date(times[0]).getTime();
  const last = new Date(times[times.length - 1]).getTime();
  const days = Math.max(1, Math.round((last - first) / 86400000) + 1);
  const activeDays = new Set(times.map(t => t.slice(0, 10))).size;

  return {
    days,
    activeDays,
    perDay: Math.round(charts.value.length / Math.max(1, activeDays)),
    lastPlay: times[times.length - 1].slice(0, 10),
  };
});

const freshness = computed(() => {
  const t = playLogStore.lastSyncTime;
  if (!t) return { tone: 'muted', text: '尚无同步记录' };
  const days = (Date.now() - new Date(t).getTime()) / 86400000;
  const text = `数据 ${new Date(t).toLocaleDateString('zh-CN')} · ${playLogStore.records.length} 条记录`;
  if (days > 14) return { tone: 'warn', text: `${text}（已过期）` };
  if (days > 7) return { tone: 'warn', text };
  return { tone: 'ok', text };
});

onMounted(async () => {
  await playLogStore.loadFromDB();
  if (playLogStore.records.length === 0) return;

  noData.value = false;
  const best = charts.value.reduce((a, b) => (a.achievements > b.achievements ? a : b));
  const song = await songStore.getSong(best.songId);
  bestSongLabel.value = `${song?.title ?? '未知'} [${(DIFFICULTY_LABEL[best.difficulty] ?? best.difficulty)}] ${best.achievements.toFixed(2)}%`;

  await nextTick();
  playEntrance();
});

function playEntrance() {
  if (rootEl.value) {
    staggerIn(Array.from(rootEl.value.querySelectorAll('.stat-card, .panel')), 0.06);
  }
  rootEl.value?.querySelectorAll<HTMLElement>('[data-count]').forEach(el => {
    const end = Number(el.dataset.count);
    if (!Number.isFinite(end) || end <= 0) return;
    const decimals = Number(el.dataset.decimals) || 0;
    const fmt = el.dataset.fmt === 'locale'
      ? (v: number) => Math.round(v).toLocaleString()
      : el.dataset.fmt === 'int'
        ? (v: number) => String(Math.round(v))
        : undefined;
    countUp(el, 0, end, 0.9, decimals, fmt);
  });
}
</script>

<style scoped>
.stats-view {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: var(--letter-spacing-tight);
}
.page-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.freshness {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
}
.freshness .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }
.freshness.ok .dot { background: var(--color-success); }
.freshness.warn .dot { background: var(--color-warning); }
.freshness.warn { color: var(--color-warning); }

.empty-state {
  padding: 60px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

/* ===== 指标卡 ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: transform var(--transition-smooth), box-shadow var(--transition-smooth);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: var(--letter-spacing-wide);
}
.stat-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: var(--letter-spacing-tight);
}
.stat-value i {
  font-size: 12px;
  font-style: normal;
  color: var(--text-muted);
  margin-left: 2px;
}
.stat-hint { font-size: 10px; color: var(--text-muted); }

.caliber-note {
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-secondary);
  background: rgba(74, 114, 255, 0.05);
  border: 1px solid rgba(74, 114, 255, 0.12);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}
.caliber-note b { color: var(--text-primary); }

.best-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
}
.best-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
}
.best-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: var(--letter-spacing-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 分布面板 ===== */
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 18px 20px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.panel-hint { font-size: 10px; color: var(--text-muted); }

.bar-list { display: flex; flex-direction: column; gap: 9px; }

.bar-row {
  display: grid;
  grid-template-columns: 62px 1fr 44px 52px;
  align-items: center;
  gap: 10px;
  animation: row-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 55ms);
}

@keyframes row-in {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: none; }
}

.bar-name {
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  color: var(--text-secondary);
}
.bar-name.diff-basic { color: var(--diff-basic); }
.bar-name.diff-advanced { color: var(--diff-advanced); }
.bar-name.diff-expert { color: var(--diff-expert); }
.bar-name.diff-master { color: var(--diff-master); }
.bar-name.diff-remaster { color: var(--diff-remaster); }
.bar-name.tier { color: var(--text-secondary); font-weight: 800; }

.bar-track {
  height: 9px;
  border-radius: var(--radius-full);
  background: rgba(139, 155, 180, 0.16);
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.bar-fill.diff-basic { background: var(--diff-basic); }
.bar-fill.diff-advanced { background: var(--diff-advanced); }
.bar-fill.diff-expert { background: var(--diff-expert); }
.bar-fill.diff-master { background: var(--diff-master); }
.bar-fill.diff-remaster { background: var(--diff-remaster); }

.bar-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: right;
}
.bar-pct {
  font-size: 10px;
  color: var(--text-muted);
  text-align: right;
}

/* ===== 跨度 ===== */
.span-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.span-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 6px;
  border-radius: var(--radius-md);
  background: var(--bg-body);
}
.span-num {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: var(--letter-spacing-tight);
}
.span-label { font-size: 10px; color: var(--text-muted); text-align: center; }

@media (prefers-reduced-motion: reduce) {
  .bar-row { animation: none; }
  .bar-fill { transition: none; }
  .stat-card:hover { transform: none; }
}
</style>
