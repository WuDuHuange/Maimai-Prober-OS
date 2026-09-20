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
      <div ref="headRef" class="result-head" :class="{ stuck }">
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

      <!-- ① 技术类型专项（DXRating 评价组） -->
      <section v-if="visibleTypes.length" class="panel" :style="{ '--d': 0 }">
        <div class="panel-head">
          <span class="panel-title">技术类型专项</span>
          <span class="panel-hint">相对本人 B50 平均</span>
        </div>
        <div class="type-list">
          <div v-for="(t, i) in visibleTypes" :key="t.tagId" class="type-row" :style="{ '--d': i }">
            <span class="type-name">{{ t.name }}</span>
            <span class="type-track">
              <span class="type-axis" />
              <span
                v-if="t.avgOwnDelta != null"
                class="type-bar"
                :class="t.avgOwnDelta < 0 ? 'neg' : 'pos'"
                :style="{ width: barW(t) }"
              />
            </span>
            <span class="type-val" :class="deltaClass(t.avgOwnDelta)">{{ fmtDelta(t.avgOwnDelta) }}</span>
            <span class="type-count">{{ t.chartCount }} 张</span>
            <span class="type-badge-slot">
              <i v-if="t.verdict === 'strong'" class="v-badge strong">强项</i>
              <i v-else-if="t.verdict === 'weak'" class="v-badge weak">短板</i>
            </span>
          </div>
        </div>
        <p class="panel-note">{{ typeNote }}</p>
      </section>

      <!-- ② 打谱偏向（tag 两两组合） -->
      <section v-if="combos.length" class="panel" :style="{ '--d': 1 }">
        <div class="panel-head">
          <span class="panel-title">打谱偏向</span>
          <span class="panel-hint">tag 组合 · 相对你 B50 平均</span>
        </div>
        <div class="combo-list">
          <div
            v-for="(c, i) in combos"
            :key="c.label"
            class="combo-row"
            :style="{ '--d': i }"
            :title="`${c.chartCount} 张 · 平均达成 ${c.avgAchievement?.toFixed(2) ?? '?'}%`"
          >
            <span class="combo-label">{{ c.label }}</span>
            <span class="combo-track">
              <span
                v-if="c.avgOwnDelta != null"
                class="combo-bar"
                :class="c.avgOwnDelta < 0 ? 'neg' : 'pos'"
                :style="{ width: comboW(c.avgOwnDelta) }"
              />
            </span>
            <span class="combo-val" :class="deltaClass(c.avgOwnDelta)">{{ fmtDelta(c.avgOwnDelta) }}</span>
            <span class="combo-count">{{ c.chartCount }} 张</span>
          </div>
        </div>
        <p class="panel-note">只看样本 ≥ 3 张的组合 · 正 = 比你的 B50 平均打得好</p>
      </section>

      <!-- ③ 选曲口味（官方 genre）—— 只反映兴趣，不评强弱 -->
      <section v-if="genres.length" class="panel" :style="{ '--d': 2 }">
        <div class="panel-head">
          <span class="panel-title">选曲口味</span>
          <span class="panel-hint">B50 曲风占比 · 与水平无关</span>
        </div>
        <div class="genre-list">
          <div
            v-for="(g, i) in genres"
            :key="g.genre"
            class="genre-row"
            :style="{ '--d': i }"
            :title="`${g.chartCount} 张 · 平均达成 ${g.avgAchievement?.toFixed(2) ?? '?'}% · 平均定数 ${g.avgConstant?.toFixed(1) ?? '?'}`"
          >
            <span class="genre-name">{{ g.genre }}</span>
            <span class="genre-track"><span class="genre-fill" :style="{ width: pct(g.share) }" /></span>
            <span class="genre-share">{{ pct(g.share) }}</span>
            <span class="genre-count">{{ g.chartCount }} 张</span>
          </div>
        </div>
      </section>

      <!-- ④ 定数分布 -->
      <section v-if="hist.length" class="panel" :style="{ '--d': 3 }">
        <div class="panel-head">
          <span class="panel-title">定数分布</span>
          <span class="panel-hint">B50 难度构成</span>
        </div>
        <div class="hist">
          <div
            v-for="(h, i) in hist"
            :key="h.label"
            class="hist-col"
            :style="{ '--d': i }"
            :title="`定数 ${h.label} → ${h.count} 张`"
          >
            <span class="hist-count">{{ h.count || '' }}</span>
            <span class="hist-bar" :style="{ height: histPct(h) }" />
            <span class="hist-label">{{ h.label }}</span>
          </div>
        </div>
      </section>

      <!-- 总评 -->
      <p class="headline">{{ result.headline }}</p>

      <!-- 教练详细分析（存一份，随时点开看） -->
      <button
        v-if="reportStore.hasReport"
        class="report-row"
        @click="openReport"
      >
        <span class="report-badge">AI</span>
        <span class="report-info">
          <span class="report-title">教练详细分析</span>
          <span class="report-meta">
            {{ reportMeta }}
            <span v-if="reportStore.isStale" class="report-stale">· 数据已更新</span>
          </span>
        </span>
        <span class="report-cta">查看 →</span>
      </button>

      <button
        v-else
        class="report-row empty"
        :disabled="reportStore.isGenerating"
        @click="openReport"
      >
        <span class="report-badge">AI</span>
        <span class="report-info">
          <span class="report-title">
            {{ reportStore.isGenerating ? '教练正在写报告…' : '让教练展开详细分析' }}
          </span>
          <span class="report-meta">生成后存在本地，随时回看 —— 不用每次重新问</span>
        </span>
        <span class="report-cta">{{ reportStore.isGenerating ? '…' : '生成 →' }}</span>
      </button>

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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import AbilityRadarChart from '@/components/charts/AbilityRadarChart.vue';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { useAIChatStore } from '@/stores/useAIChatStore';
import { useCoachReportStore } from '@/stores/useCoachReportStore';
import { DIFFICULTY_LABEL_SHORT, type DifficultyType } from '@/types/song';
import type { ChartAnalysis, TypeSpecialty } from '@/types/b50Analysis';

defineEmits<{
  analyze: [];
  reanalyze: [];
  ask: [text: string];
  collapse: [];
}>();

const analysis = useAnalysisStore();
const chatStore = useAIChatStore();
const reportStore = useCoachReportStore();

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

const reportMeta = computed(() => {
  const r = reportStore.report;
  if (!r) return '';
  const d = new Date(r.generatedAt);
  const t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${t} · ${r.model || r.provider}`;
});

/**
 * 打开弹窗；若还没有报告就顺手开始生成 —— 省掉「先开窗再点生成」那一步。
 * 生成状态存在 Pinia 里，弹窗本身挂在 App.vue，所以切 tab / 收起卡片都不会打断。
 */
function openReport() {
  reportStore.open();
  if (!reportStore.hasReport && !reportStore.isGenerating) {
    reportStore.generate();
  }
}

// 报告存在 IndexedDB 里，进页面时读一次；读到了就一直用缓存
onMounted(() => {
  if (!reportStore.report) reportStore.load();
});

const quickQuestions = [
  '详细讲解这份分析',
  '我该怎么提升最弱的那一维？',
  '推荐几张针对性练习曲',
];

/* ================= 新面板数据 ================= */

/** Δ 的显示上限（发散条半幅）；超出直接夹住，避免个别极值把刻度压扁 */
const DELTA_RANGE = 2.0;
const VERDICT_STRONG = 0.3;
const VERDICT_WEAK = -0.3;

const visibleTypes = computed(() =>
  (result.value?.typeSpecialties ?? []).filter(t => t.chartCount > 0)
);
const genres = computed(() =>
  (result.value?.genreTastes ?? []).filter(g => g.chartCount > 0)
);

/**
 * 打谱偏向 —— 只取组合的**两端**（最强 / 最弱）。
 * 中间态没有信息量，全列出来只会把面板撑长。
 * 样本门槛（≥3 张）由算法侧保证。
 */
const COMBO_SHOWN = 5;
const combos = computed(() => {
  const all = result.value?.typeCombos ?? [];
  if (all.length <= COMBO_SHOWN * 2) return all;
  return [...all.slice(0, COMBO_SHOWN), ...all.slice(-COMBO_SHOWN)];
});
const hist = computed(() => result.value?.structure.constHistogram ?? []);
const histMax = computed(() => Math.max(1, ...hist.value.map(h => h.count)));

/** 发散条：从中轴向左右伸，半幅 = DELTA_RANGE */
function barW(t: TypeSpecialty): string {
  const v = Math.min(Math.abs(t.avgOwnDelta ?? 0), DELTA_RANGE);
  return `${(v / DELTA_RANGE) * 50}%`;
}

/** 偏向条：单向横条，宽度按 |Δ| / DELTA_RANGE 归一（下限 3% 保证可见） */
function comboW(v: number | null): string {
  const x = Math.min(Math.abs(v ?? 0), DELTA_RANGE);
  return `${Math.max(3, (x / DELTA_RANGE) * 100)}%`;
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function histPct(h: { count: number }): string {
  return `${Math.max(3, (h.count / histMax.value) * 100)}%`;
}

function fmtDelta(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

function deltaClass(v: number | null): string {
  if (v == null) return 'delta-muted';
  if (v >= VERDICT_STRONG) return 'delta-pos';
  if (v <= VERDICT_WEAK) return 'delta-neg';
  return 'delta-neutral';
}

/** 说明哪些类型样本不足 —— 覆盖率低的类型不该被硬给结论 */
const typeNote = computed(() => {
  const all = result.value?.typeSpecialties ?? [];
  const insuff = all.filter(t => t.verdict === 'insufficient');
  const base = 'Δ = 该类谱平均达成率 − 本人 B50 平均达成率（正 = 这类谱比你的平均打得好）。数据来自 DXRating 社区标注。';
  if (!insuff.length) return base;
  return `${insuff.map(t => t.name).join('、')} 在 B50 里样本不足 3 张，未参与判定。${base}`;
});

/* ================= 滚动吸附 ================= */
// 「收起」按钮原本会被长内容顶出可视区，必须滚回去才能点到。
// 这里把标题栏做成 sticky，并只在真正吸住时加分隔线/投影，避免常态多一条线。
const headRef = ref<HTMLElement | null>(null);
const stuck = ref(false);
let scrollHost: HTMLElement | Window | null = null;

function onScroll() {
  const el = headRef.value;
  if (!el) return;
  const base = scrollHost instanceof HTMLElement
    ? scrollHost.getBoundingClientRect().top
    : 0;
  stuck.value = el.getBoundingClientRect().top <= base + 1;
}

watch(headRef, (el) => {
  if (scrollHost) scrollHost.removeEventListener('scroll', onScroll);
  // 卡片的滚动容器是 .coach-card-wrap（AIChatPanel 里限高的那个）
  scrollHost = el
    ? ((el.closest('.coach-card-wrap') as HTMLElement | null) ?? window)
    : null;
  scrollHost?.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}, { flush: 'post' });

onUnmounted(() => {
  scrollHost?.removeEventListener('scroll', onScroll);
});

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
/* 吸附头部：卡片内容很长时，「收起」按钮会滚出可视区 —— 用户必须滑回去才能点。
   做成 sticky 后始终贴住 .coach-card-wrap 顶部；分隔线只在真正吸住时出现。 */
.result-head {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 8px;
  margin-top: -4px;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid transparent;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.result-head.stuck {
  border-bottom-color: var(--border-color-light);
  box-shadow: 0 8px 16px -14px rgba(15, 23, 42, 0.55);
}
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

/* ===== 教练详细分析入口 ===== */
.report-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 13px;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(124, 107, 247, 0.22);
  background: linear-gradient(120deg, rgba(74, 114, 255, 0.055), rgba(157, 123, 255, 0.055));
  transition: all var(--transition-fast);
}
.report-row:hover:not(:disabled) {
  border-color: rgba(124, 107, 247, 0.42);
  background: linear-gradient(120deg, rgba(74, 114, 255, 0.09), rgba(157, 123, 255, 0.09));
}
.report-row:disabled { opacity: 0.6; cursor: not-allowed; }

.report-badge {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fff;
  background: linear-gradient(135deg, #4A72FF, #9D7BFF);
  box-shadow: 0 3px 10px rgba(74, 114, 255, 0.28);
}

.report-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.report-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.report-meta {
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-stale { color: var(--color-warning); font-weight: 600; }

.report-cta {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  white-space: nowrap;
}

.sources { display: flex; flex-wrap: wrap; gap: 6px; }.src {
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

/* ============================================================
   新增三个面板：技术类型专项 / 选曲口味 / 定数分布
   ============================================================ */
.panel {
  padding: 12px 13px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-light);
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: panel-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 70ms);
}

@keyframes panel-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.panel-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.panel-hint { font-size: 10px; color: var(--text-muted); }

.panel-note {
  font-size: 10px;
  line-height: 1.65;
  color: var(--text-muted);
  padding-top: 2px;
  border-top: 1px dashed rgba(139, 155, 180, 0.25);
}

/* ---- ① 技术类型专项：中轴发散条 ---- */
.type-list { display: flex; flex-direction: column; gap: 7px; }

.type-row {
  display: grid;
  grid-template-columns: 62px 1fr 48px 38px 34px;
  align-items: center;
  gap: 8px;
  animation: row-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms);
}

@keyframes row-in {
  from { opacity: 0; transform: translateX(-5px); }
  to   { opacity: 1; transform: none; }
}

.type-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: rgba(139, 155, 180, 0.14);
}
.type-axis {
  position: absolute;
  left: 50%;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: rgba(100, 116, 139, 0.4);
}
.type-bar {
  position: absolute;
  top: 0;
  height: 100%;
  animation: bar-grow 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms + 120ms);
}
.type-bar.neg {
  right: 50%;
  border-radius: 999px 0 0 999px;
  background: linear-gradient(90deg, #F59E0B, #EF4444);
  transform-origin: right center;
}
.type-bar.pos {
  left: 50%;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, #10B981, #34D399);
  transform-origin: left center;
}

@keyframes bar-grow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

.type-val {
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.type-count { font-size: 10px; color: var(--text-muted); text-align: right; }
.type-badge-slot { display: flex; justify-content: flex-end; }

.v-badge {
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}
.v-badge.strong { background: rgba(16, 185, 129, 0.12); color: #047857; }
.v-badge.weak { background: rgba(245, 158, 11, 0.14); color: #B45309; }

.delta-pos { color: #059669; }
.delta-neg { color: #DC2626; }
.delta-neutral { color: var(--text-muted); }
.delta-muted { color: var(--text-muted); }

/* ---- ② 选曲口味 ---- */
.genre-list { display: flex; flex-direction: column; gap: 6px; }

.genre-row {
  display: grid;
  grid-template-columns: 118px 1fr 44px 46px;
  align-items: center;
  gap: 8px;
  animation: row-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms);
}

.genre-name {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.genre-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(139, 155, 180, 0.14);
  overflow: hidden;
}
.genre-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4A72FF, #9D7BFF);
  transform-origin: left center;
  animation: bar-grow 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms + 100ms);
}

.genre-share {
  font-size: 10px;
  color: var(--text-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.genre-count { font-size: 10px; color: var(--text-muted); text-align: right; font-variant-numeric: tabular-nums; }

/* ---- ③ 打谱偏向（tag 两两组合） ---- */
.combo-list { display: flex; flex-direction: column; gap: 6px; }

.combo-row {
  display: grid;
  grid-template-columns: 150px 1fr 44px 40px;
  align-items: center;
  gap: 8px;
  animation: row-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms);
}

.combo-label {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(139, 155, 180, 0.14);
  overflow: hidden;
}

.combo-bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  transform-origin: left center;
  animation: bar-grow 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms + 100ms);
}
.combo-bar.pos { background: linear-gradient(90deg, #10B981, #34D399); }
.combo-bar.neg { background: linear-gradient(90deg, #F59E0B, #EF4444); }

.combo-val {
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.combo-count { font-size: 10px; color: var(--text-muted); text-align: right; }

/* ---- ③ 定数分布直方图 ---- */
.hist {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 96px;
  padding-top: 12px;
}

.hist-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
}

.hist-count {
  font-size: 9px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.hist-bar {
  width: 100%;
  max-width: 26px;
  border-radius: 4px 4px 2px 2px;
  background: linear-gradient(180deg, #9D7BFF, #4A72FF);
  transform-origin: bottom center;
  animation: col-grow 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--d, 0) * 40ms + 90ms);
}

@keyframes col-grow {
  from { transform: scaleY(0); opacity: 0.3; }
  to   { transform: scaleY(1); opacity: 1; }
}

.hist-label {
  font-size: 9px;
  color: var(--text-muted);
  white-space: nowrap;
  transform: scale(0.92);
}

@media (prefers-reduced-motion: reduce) {
  .panel, .type-row, .genre-row, .type-bar, .genre-fill, .hist-bar {
    animation: none;
  }
  .result-head { transition: none; }
}
</style>
