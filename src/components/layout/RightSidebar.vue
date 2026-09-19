<template>
  <aside class="right-panel" :class="{ collapsed }">
    <!-- 折叠态：只剩一根竖排展开条 -->
    <button
      v-if="collapsed"
      class="rail-btn"
      title="展开状态栏"
      @click="toggleCollapse"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>

    <template v-else>
      <div class="panel-head">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">状态总览</span>
          <span class="beta-tag">LIVE</span>
        </div>
        <button class="icon-btn" title="收起状态栏" @click="toggleCollapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div v-if="!hasData" class="empty-box">
        请先在首页点击「同步数据」，状态栏会自动填充。
      </div>

      <template v-else>
        <!-- ① 玩家卡 -->
        <section class="card player-card">
          <div class="player-row">
            <img v-if="playerStore.avatarUrl" class="avatar" :src="playerStore.avatarUrl" alt="" />
            <div v-else class="avatar avatar-fallback">{{ playerInitial }}</div>
            <div class="player-meta">
              <span class="player-name">{{ playerStore.playerName }}</span>
              <span class="player-sub">B50 合计 {{ b50Store.computedRating }}</span>
            </div>
          </div>

          <div class="rating-line">
            <span class="rating-num">{{ playerStore.currentRating }}</span>
            <span class="rating-gap">距 {{ nextMilestone }} 还差 <b>{{ milestoneGap }}</b></span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: bandProgress + '%' }" />
          </div>
        </section>

        <!-- ② 六维迷你雷达 -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">六维能力</span>
            <button
              v-if="analysisStore.hasResult"
              class="mini-btn"
              :disabled="analysisStore.isAnalyzing"
              @click="analysisStore.runAnalysis()"
            >{{ analysisStore.isAnalyzing ? '…' : '重算' }}</button>
          </div>

          <template v-if="analysisStore.hasResult">
            <AbilityRadarChart :dimensions="dimensions" :height="150" />
            <p class="headline">{{ analysisStore.headline }}</p>
          </template>
          <div v-else class="radar-empty">
            <p class="empty-text">尚未生成分析（纯本地计算，不消耗 AI 额度）</p>
            <button class="mini-btn primary" :disabled="analysisStore.isAnalyzing" @click="analysisStore.runAnalysis()">
              {{ analysisStore.isAnalyzing ? '分析中…' : '生成六维分析' }}
            </button>
            <p v-if="analysisStore.lastError" class="err-text">{{ analysisStore.lastError }}</p>
          </div>
        </section>

        <!-- ③ B50 结构三格 -->
        <section v-if="structure" class="stat-grid">
          <div class="stat-cell">
            <span class="stat-num">{{ structure.avgConstant.toFixed(2) }}</span>
            <span class="stat-label">平均定数</span>
          </div>
          <div class="stat-cell">
            <span class="stat-num">{{ structure.countBirdPlus }}</span>
            <span class="stat-label">鸟加</span>
          </div>
          <div class="stat-cell">
            <span class="stat-num">{{ structure.avgAchievement.toFixed(2) }}<i>%</i></span>
            <span class="stat-label">平均达成</span>
          </div>
        </section>

        <!-- ④ 建议优先练 -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">建议优先练</span>
            <span v-if="focusCharts.length" class="card-hint">B50 内部对比</span>
          </div>
          <div v-if="focusCharts.length" class="focus-list">
            <button
              v-for="c in focusCharts"
              :key="c.songId + c.difficulty"
              class="focus-item"
              :title="`${c.title} — 比自身 B50 平均低 ${Math.abs(c.ownDelta).toFixed(2)}%`"
              @click="openSong(c.songId)"
            >
              <span class="focus-bar" :style="{ background: deltaColor(c.ownDelta) }" />
              <span class="focus-info">
                <span class="focus-title">{{ c.title }}</span>
                <span class="focus-sub">{{ DIFFICULTY_LABEL_SHORT[c.difficulty] }} · 定数 {{ c.constant?.toFixed(1) ?? '?' }}</span>
              </span>
              <span class="focus-delta">{{ c.ownDelta.toFixed(2) }}%</span>
            </button>
          </div>
          <p v-else-if="analysisStore.hasResult" class="empty-text">
            你的 B50 达成率很集中，没有明显掉队的谱面（低于自身平均 0.5% 以上的为 0 张）。
          </p>
          <p v-else class="empty-text">先生成六维分析，这里会列出相对你自己 B50 平均明显偏低的谱面。</p>
        </section>

        <!-- ⑤ 练习计划 -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">练习计划</span>
            <span v-if="plans.length" class="card-hint">{{ plans.length }} 份</span>
          </div>
          <p v-if="!plans.length" class="empty-text">在「AI复盘」页让教练给出方案，点「保存为练习计划」后会出现在这里。</p>
          <template v-else>
            <p class="plan-preview">{{ plans[0].summary.slice(0, 70) }}…</p>
            <p class="plan-time">{{ formatDate(plans[0].createdAt) }}</p>
          </template>
          <button class="mini-btn block" @click="openPracticePlan">查看练习计划</button>
        </section>

        <!-- ⑥ 数据新鲜度 -->
        <section class="freshness">
          <span class="dot" :class="freshness.tone" />
          <span>{{ freshness.text }}</span>
        </section>

        <!-- ⑦ 底部入口 -->
        <button class="ai-entry" @click="openAI">
          <span class="ai-entry-dot" />
          打开 AI 对话
        </button>
      </template>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useB50Store } from '@/stores/useB50Store';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { db } from '@/services/db';
import { DIFFICULTY_LABEL_SHORT } from '@/types/song';

// echarts 体积大 —— 只在真的生成了分析结果时才加载雷达图
const AbilityRadarChart = defineAsyncComponent(
  () => import('@/components/charts/AbilityRadarChart.vue')
);

interface PracticePlanItem {
  id?: number;
  createdAt: string;
  summary: string;
  songs: Array<{ songId: number; title: string; constant: number | null }>;
}

const COLLAPSE_KEY = 'right_sidebar_collapsed';

const playerStore = usePlayerStore();
const b50Store = useB50Store();
const analysisStore = useAnalysisStore();
const playLogStore = usePlayLogStore();

const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1');
const plans = ref<PracticePlanItem[]>([]);

const hasData = computed(() => b50Store.b50List.length > 0 || playerStore.currentRating > 0);
const playerInitial = computed(() => (playerStore.playerName || '?').slice(0, 1).toUpperCase());
const dimensions = computed(() => analysisStore.result?.dimensions ?? []);
const structure = computed(() => analysisStore.result?.structure ?? null);

/** 建议优先练：B50 内部对比中低于自身平均最多的三条 */
const focusCharts = computed(() => {
  const weak = analysisStore.result?.highlights.weakCharts ?? [];
  return [...weak].sort((a, b) => a.ownDelta - b.ownDelta).slice(0, 3);
});

/** 下一个整百关口 */
const nextMilestone = computed(() => {
  const r = playerStore.currentRating;
  return r > 0 ? (Math.floor(r / 100) + 1) * 100 : 100;
});

const milestoneGap = computed(() => Math.max(0, nextMilestone.value - playerStore.currentRating));

/** 当前整百区间的推进度 */
const bandProgress = computed(() => {
  const r = playerStore.currentRating;
  if (r <= 0) return 0;
  return Math.min(100, Math.max(0, ((r % 100) / 100) * 100));
});

const freshness = computed(() => {
  const t = playLogStore.lastSyncTime;
  if (!t) return { tone: 'muted', text: '尚无同步记录' };
  const days = (Date.now() - new Date(t).getTime()) / 86400000;
  const text = `数据 ${formatDate(t)} · ${playLogStore.totalCount} 条`;
  if (days > 14) return { tone: 'warn', text: `${text}（已过期）` };
  if (days > 7) return { tone: 'warn', text };
  return { tone: 'ok', text };
});

/** 偏差越大越红，越接近 0 越中性 */
function deltaColor(delta: number): string {
  const a = Math.min(1, Math.abs(delta) / 2);
  return `rgba(239, 68, 68, ${0.35 + a * 0.65})`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0');
}

function openSong(songId: number) {
  window.dispatchEvent(new CustomEvent('nav-to-song', { detail: songId }));
}

function openAI() {
  window.dispatchEvent(new CustomEvent('nav-to-ai'));
}

function openPracticePlan() {
  window.dispatchEvent(new CustomEvent('nav-to-practice-plan'));
}

async function loadPlans() {
  try {
    const row = await db.appSettings.get('practice_plans');
    plans.value = row?.value ? JSON.parse(row.value) : [];
  } catch {
    plans.value = [];
  }
}

onMounted(() => {
  loadPlans();
  window.addEventListener('practice-plan-updated', loadPlans);
});

onUnmounted(() => {
  window.removeEventListener('practice-plan-updated', loadPlans);
});
</script>

<style scoped>
.right-panel {
  width: var(--ai-panel-width);
  height: 100%;
  background: transparent;
  border-left: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 14px;
  transition: width var(--transition-smooth), padding var(--transition-smooth);
}

.right-panel.collapsed {
  width: 38px;
  padding: 14px 6px;
  align-items: center;
  gap: 0;
}

.rail-btn {
  border: 1px solid var(--border-color-light);
  background: var(--bg-card);
  color: var(--text-secondary);
  width: 26px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-xs);
  transition: all var(--transition-fast);
}
.rail-btn:hover { color: var(--color-primary); border-color: rgba(74, 114, 255, 0.3); }

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.beta-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tag);
  color: var(--color-primary);
  letter-spacing: var(--letter-spacing-wide);
}

.icon-btn {
  border: none;
  background: var(--bg-hover);
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}
.icon-btn:hover { color: var(--color-primary); }

.empty-box {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
  padding: 18px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-light);
}

/* ---- 通用卡片 ---- */
.card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color-light);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-hint {
  font-size: 10px;
  color: var(--text-muted);
}

/* ---- 玩家卡 ---- */
.player-row { display: flex; align-items: center; gap: 10px; }

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: #fff;
  font-weight: 700;
  font-size: 15px;
}

.player-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.player-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-sub { font-size: 10px; color: var(--text-muted); }

.rating-line { display: flex; align-items: baseline; justify-content: space-between; }
.rating-num {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-primary);
  letter-spacing: var(--letter-spacing-tight);
}
.rating-gap { font-size: 10px; color: var(--text-muted); }
.rating-gap b { color: var(--color-warning); }

.bar-track {
  height: 4px;
  border-radius: 2px;
  background: var(--bg-hover);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  transition: width var(--transition-smooth);
}

/* ---- 雷达 ---- */
.headline {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.radar-empty { display: flex; flex-direction: column; gap: 8px; }
.empty-text { font-size: 11px; line-height: 1.6; color: var(--text-muted); }
.err-text { font-size: 10px; color: var(--color-danger); line-height: 1.5; }

/* ---- 三格 ---- */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

.stat-cell {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-light);
  box-shadow: var(--shadow-xs);
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-num {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: var(--letter-spacing-tight);
}
.stat-num i { font-size: 9px; font-style: normal; color: var(--text-muted); }
.stat-label { font-size: 9px; color: var(--text-muted); }

/* ---- 优先练 ---- */
.focus-list { display: flex; flex-direction: column; gap: 6px; }

.focus-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: var(--bg-body);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
}
.focus-item:hover { background: var(--bg-hover); }

.focus-bar { width: 3px; height: 26px; border-radius: 2px; flex-shrink: 0; }

.focus-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.focus-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.focus-sub { font-size: 9px; color: var(--text-muted); }

.focus-delta {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-danger);
  flex-shrink: 0;
}

/* ---- 练习计划 ---- */
.plan-preview {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.plan-time { font-size: 9px; color: var(--text-muted); }

/* ---- 按钮 ---- */
.mini-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.mini-btn:hover:not(:disabled) {
  background: rgba(74, 114, 255, 0.06);
  border-color: rgba(74, 114, 255, 0.3);
}
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-btn.block { width: 100%; }
.mini-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.mini-btn.primary:hover:not(:disabled) { background: var(--color-primary-dark); }

/* ---- 新鲜度 ---- */
.freshness {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-muted);
  padding: 0 2px;
}
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dot.ok { background: var(--color-success); }
.dot.warn { background: var(--color-warning); }
.dot.muted { background: var(--text-muted); }

/* ---- AI 入口 ---- */
.ai-entry {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 16px;
  border-radius: 9999px;
  border: none;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(74, 114, 255, 0.25);
  transition: all var(--transition-fast);
}
.ai-entry:hover { box-shadow: 0 8px 26px rgba(74, 114, 255, 0.35); transform: translateY(-1px); }

.ai-entry-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-entry-dot { animation: none; }
  .bar-fill { transition: none; }
}
</style>
