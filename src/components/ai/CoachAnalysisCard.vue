<template>
  <div class="coach-card">
    <!-- ============ 未分析：入口按钮 ============ -->
    <template v-if="!analysis.hasResult && !analysis.isAnalyzing">
      <button class="analyze-btn" :disabled="!canAnalyze" @click="$emit('analyze')">
        <span class="btn-glow" aria-hidden="true" />
        <span class="btn-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
            <circle cx="12" cy="12" r="3.2"/>
          </svg>
        </span>
        <span class="btn-text">
          <span class="btn-title">生成 B50 能力分析</span>
          <span class="btn-sub">六维雷达图 · 水度判定 · 社区标注交叉验证</span>
        </span>
        <span class="btn-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </span>
      </button>
      <p v-if="!canAnalyze" class="hint warn">尚未同步战绩数据，请先点击侧边栏「开始同步」</p>
      <p v-else class="hint">分析在本地完成，不消耗 AI 额度；随后可让教练基于结果展开讲解</p>
    </template>

    <!-- ============ 分析中 ============ -->
    <div v-else-if="analysis.isAnalyzing && !analysis.hasResult" class="loading">
      <span class="spinner" />
      <span class="loading-text">正在计算六维能力…</span>
    </div>

    <!-- ============ 已分析 ============ -->
    <template v-else-if="result">
      <div class="result-head">
        <div class="head-left">
          <span class="head-title">B50 能力分析</span>
          <span class="head-time">{{ shortTime }}</span>
        </div>
        <div class="head-actions">
          <button class="mini-btn" :disabled="analysis.isAnalyzing" @click="$emit('reanalyze')" title="重新计算">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>
            </svg>
          </button>
          <button class="mini-btn" @click="$emit('collapse')" title="收起">收起</button>
        </div>
      </div>

      <!-- 雷达图 -->
      <AbilityRadarChart :dimensions="result.dimensions" :height="264" />

      <!-- 维度明细 -->
      <div class="dims">
        <div v-for="d in result.dimensions" :key="d.id" class="dim-row" :class="{ dimmed: d.insufficient }">
          <span class="dim-name">{{ d.label }}</span>
          <span class="dim-bar"><i :style="{ width: d.score + '%' }" /></span>
          <span class="dim-score">{{ d.score }}</span>
          <span class="dim-raw" :title="d.basis">{{ d.rawLabel }}</span>
        </div>
      </div>

      <!-- 总评 -->
      <p class="headline">{{ result.headline }}</p>

      <!-- 数据新鲜度 -->
      <div class="sources">
        <span class="src" :class="{ off: !result.tagAvailable }">
          社区标注 {{ result.tagAvailable ? '✓' : '×' }}
        </span>
        <span class="src" :class="{ off: result.baselineCoverage.matched === 0 }">
          拟合定数基准 {{ result.baselineCoverage.matched }}/{{ result.baselineCoverage.total }}
        </span>
        <span class="src off" title="同段聚合数据源当前不可用，本分析不做任何跨玩家强弱对比">
          同段基准 ×
        </span>
      </div>

      <!-- 亮点 / 风险 -->
      <div v-if="hasHighlights" class="highlights">
        <div v-if="result.highlights.waterCharts.length" class="hl-group">
          <div class="hl-head">
            <span class="hl-dot" style="background:#0EA5E9" />
            偏「水」谱面 <b>{{ result.highlights.waterCharts.length }}</b>
          </div>
          <ul class="hl-list">
            <li v-for="c in top(result.highlights.waterCharts)" :key="keyOf(c)">
              <span class="hl-title">{{ c.title }}</span>
              <span class="hl-meta">{{ diffLabel(c.difficulty) }} {{ c.constant?.toFixed(1) }} · {{ c.achievements.toFixed(2) }}%</span>
            </li>
          </ul>
        </div>

        <div v-if="result.highlights.underratedCharts.length" class="hl-group">
          <div class="hl-head">
            <span class="hl-dot" style="background:#8B5CF6" />
            偏「硬」谱面 <b>{{ result.highlights.underratedCharts.length }}</b>
          </div>
          <ul class="hl-list">
            <li v-for="c in top(result.highlights.underratedCharts)" :key="keyOf(c)">
              <span class="hl-title">{{ c.title }}</span>
              <span class="hl-meta">{{ diffLabel(c.difficulty) }} {{ c.constant?.toFixed(1) }} · {{ c.achievements.toFixed(2) }}%</span>
            </li>
          </ul>
        </div>

        <div v-if="result.highlights.weakCharts.length" class="hl-group">
          <div class="hl-head">
            <span class="hl-dot" style="background:#F59E0B" />
            相对自己偏低 <b>{{ result.highlights.weakCharts.length }}</b>
          </div>
          <ul class="hl-list">
            <li v-for="c in top(result.highlights.weakCharts)" :key="keyOf(c)">
              <span class="hl-title">{{ c.title }}</span>
              <span class="hl-meta">{{ diffLabel(c.difficulty) }} {{ c.constant?.toFixed(1) }} · {{ c.ownDelta > 0 ? '+' : '' }}{{ c.ownDelta.toFixed(2) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 追问入口 -->
      <div class="ask-row">
        <button
          v-for="q in quickQuestions"
          :key="q"
          class="ask-chip"
          :disabled="chatStore.isStreaming"
          @click="$emit('ask', q)"
        >{{ q }}</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AbilityRadarChart from '@/components/charts/AbilityRadarChart.vue';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { useAIChatStore } from '@/stores/useAIChatStore';
import { DIFFICULTY_LABEL_SHORT, type DifficultyType } from '@/types/song';
import type { ChartAnalysis } from '@/types/b50Analysis';

defineEmits<{
  analyze: [];
  reanalyze: [];
  ask: [text: string];
  collapse: [];
}>();

const analysis = useAnalysisStore();
const chatStore = useAIChatStore();

const result = computed(() => analysis.result);
const canAnalyze = computed(() => !analysis.isAnalyzing);

const shortTime = computed(() => {
  const t = result.value?.generatedAt;
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
});

const hasHighlights = computed(() => {
  const h = result.value?.highlights;
  if (!h) return false;
  return h.waterCharts.length > 0 || h.underratedCharts.length > 0 || h.weakCharts.length > 0;
});

const quickQuestions = [
  '详细讲解这份分析',
  '我该怎么提升最弱的那一维？',
  '推荐几张针对性练习曲',
];

function top(list: ChartAnalysis[], n = 3) {
  return list.slice(0, n);
}

function keyOf(c: ChartAnalysis) {
  return `${c.songId}-${c.difficulty}`;
}

function diffLabel(d: DifficultyType) {
  return DIFFICULTY_LABEL_SHORT[d] ?? d.toUpperCase();
}
</script>

<style scoped>
.coach-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== 入口按钮 ===== */
.analyze-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px 16px;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  color: #fff;
  background: linear-gradient(120deg, #4A72FF 0%, #7C6BF7 48%, #9D7BFF 100%);
  box-shadow: 0 8px 26px rgba(74, 114, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.28s ease;
}
.analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px rgba(74, 114, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.analyze-btn:active:not(:disabled) { transform: translateY(0) scale(0.995); }
.analyze-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.btn-glow {
  position: absolute;
  inset: -40% -20% auto auto;
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(255,255,255,0.42), transparent 68%);
  transform: translate(30%, -46%);
  pointer-events: none;
  animation: sweep 5.5s ease-in-out infinite;
}
@keyframes sweep {
  0%, 100% { transform: translate(30%, -46%) scale(1); opacity: 0.85; }
  50%      { transform: translate(6%, -30%) scale(1.14); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .btn-glow { animation: none; } }

.btn-icon {
  flex-shrink: 0;
  display: grid; place-items: center;
  width: 36px; height: 36px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
}
.btn-text { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.btn-title { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.btn-sub { font-size: 11px; opacity: 0.82; }
.btn-arrow { flex-shrink: 0; opacity: 0.9; transition: transform 0.25s ease; }
.analyze-btn:hover .btn-arrow { transform: translateX(3px); }

.hint { font-size: 11px; color: var(--text-muted); line-height: 1.6; padding: 0 2px; }
.hint.warn { color: var(--color-warning); }

/* ===== 加载 ===== */
.loading {
  display: flex; align-items: center; gap: 10px;
  padding: 22px 16px; border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
}
.spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(74,114,255,0.2);
  border-top-color: var(--color-primary);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 12px; color: var(--text-secondary); }

/* ===== 结果 ===== */
.result-head { display: flex; align-items: center; justify-content: space-between; }
.head-left { display: flex; align-items: baseline; gap: 8px; }
.head-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.head-time { font-size: 10px; color: var(--text-muted); }
.head-actions { display: flex; gap: 6px; }
.mini-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 7px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px; cursor: pointer;
  transition: all var(--transition-fast);
}
.mini-btn:hover:not(:disabled) { color: var(--color-primary); border-color: rgba(74,114,255,0.35); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.dims { display: flex; flex-direction: column; gap: 6px; }
.dim-row {
  display: grid;
  grid-template-columns: 44px 1fr 26px;
  grid-template-areas: "name bar score" "raw raw raw";
  align-items: center;
  gap: 2px 8px;
}
.dim-row.dimmed { opacity: 0.5; }
.dim-name { grid-area: name; font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.dim-bar {
  grid-area: bar;
  height: 6px; border-radius: 999px;
  background: rgba(74,114,255,0.10);
  overflow: hidden;
}
.dim-bar i {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #4A72FF, #9D7BFF);
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.dim-score { grid-area: score; font-size: 12px; font-weight: 700; color: var(--color-primary); text-align: right; }
.dim-raw { grid-area: raw; font-size: 10px; color: var(--text-muted); padding-left: 2px; }

.headline {
  font-size: 12px; line-height: 1.75; color: var(--text-secondary);
  padding: 11px 13px; border-radius: 11px;
  background: rgba(74,114,255,0.045);
  border: 1px solid rgba(74,114,255,0.12);
}

.sources { display: flex; flex-wrap: wrap; gap: 6px; }
.src {
  font-size: 10px; padding: 3px 8px; border-radius: 999px;
  background: rgba(16,185,129,0.09); color: #047857;
  border: 1px solid rgba(16,185,129,0.2);
}
.src.off { background: rgba(148,163,184,0.10); color: #64748B; border-color: rgba(148,163,184,0.22); }

.highlights { display: flex; flex-direction: column; gap: 10px; }
.hl-group {
  padding: 10px 12px; border-radius: 11px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
}
.hl-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  margin-bottom: 6px;
}
.hl-head b { color: var(--text-primary); }
.hl-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.hl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.hl-list li { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
.hl-title { color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hl-meta { color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }

.ask-row { display: flex; flex-wrap: wrap; gap: 6px; }
.ask-chip {
  padding: 5px 11px; border-radius: 999px;
  border: 1px solid rgba(74,114,255,0.22);
  background: rgba(74,114,255,0.05);
  color: var(--color-primary);
  font-size: 11px; font-weight: 500; cursor: pointer;
  transition: all var(--transition-fast);
}
.ask-chip:hover:not(:disabled) { background: rgba(74,114,255,0.12); border-color: rgba(74,114,255,0.4); }
.ask-chip:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
