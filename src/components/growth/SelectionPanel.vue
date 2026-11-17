<template>
  <div class="sel">
    <!-- ===== 未生成 B50 分析：先补基准 ===== -->
    <div v-if="!analysisStore.hasResult" class="gate card-static">
      <div class="gate-badge">◎</div>
      <h3>先跑一次 B50 能力分析</h3>
      <p>
        选曲复盘要拿你的 <b>B50 平均达成率</b> 和六维结果当基准，
        所以得先有分析结果。分析在本地完成，不消耗 AI 额度。
      </p>
      <button class="primary-btn" :disabled="preparing" @click="prepare">
        {{ preparing ? '分析中…' : '生成 B50 分析' }}
      </button>
      <p v-if="analysisStore.lastError" class="gate-err">{{ analysisStore.lastError }}</p>
    </div>

    <template v-else>
      <!-- ===== 选曲区 ===== -->
      <div class="pick-grid">
        <section class="card-static picker">
          <div class="picker-head">
            <h3>挑几首来复盘</h3>
            <span class="hint">选 3–16 首 · 只能选有成绩记录的谱面</span>
          </div>

          <div class="search-row">
            <span class="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
              </svg>
            </span>
            <input v-model="query" class="search-input" placeholder="搜索曲名 / 艺人…" />
            <button v-if="query" class="clear-btn" @click="query = ''">清除</button>
          </div>

          <div v-if="!query" class="quick-block">
            <span class="quick-label">最近刷新</span>
            <div class="quick-list">
              <button
                v-for="r in recent"
                :key="keyOf(r.songId, r.difficulty)"
                class="quick-chip"
                :class="{ on: isSelected(r.songId, r.difficulty) }"
                @click="toggle(r.songId, r.difficulty)"
              >
                <span class="qc-title">{{ songTitle(r.songId) }}</span>
                <span class="qc-meta">{{ DIFFICULTY_LABEL_SHORT[r.difficulty] }} {{ r.achievements.toFixed(2) }}%</span>
              </button>
            </div>
            <p class="quick-note">按同步时刻排序 —— 这是「最近被记录到」的成绩，不是游玩顺序。</p>
          </div>

          <div class="song-list">
            <div v-for="s in pool" :key="s.songId" class="song-item">
              <img :src="getCoverUrl(s.songId)" class="si-cover" loading="lazy" @error="hideImg" />
              <div class="si-main">
                <span class="si-title">{{ s.title }}</span>
                <span class="si-artist">{{ s.artist }}</span>
              </div>
              <div class="si-charts">
                <button
                  v-for="c in chartsOf(s)"
                  :key="c.d"
                  class="chart-pill"
                  :class="{
                    on: isSelected(s.songId, c.d),
                    empty: !c.best,
                  }"
                  :disabled="!c.best"
                  :title="c.best ? `${DIFFICULTY_LABEL[c.d]} ${c.constant} · ${c.best.achievements.toFixed(2)}%` : '没有这个难度的成绩'"
                  @click="toggle(s.songId, c.d)"
                >
                  <i class="cp-diff">{{ DIFFICULTY_LABEL_SHORT[c.d] }}</i>
                  <b class="cp-const">{{ c.constant?.toFixed(1) }}</b>
                  <span v-if="c.best" class="cp-ach">{{ c.best.achievements.toFixed(1) }}</span>
                </button>
              </div>
            </div>
            <p v-if="pool.length === 0" class="list-empty">没有匹配的曲目</p>
          </div>
        </section>

        <!-- ===== 已选托盘 ===== -->
        <aside class="card-static tray">
          <div class="tray-head">
            <h3>已选 <b>{{ selected.length }}</b> / {{ MAX }}</h3>
            <button v-if="selected.length" class="clear-btn" @click="clearAll">清空</button>
          </div>

          <div v-if="selected.length === 0" class="tray-empty">
            <span class="te-icon">＋</span>
            <p>从左侧点难度按钮加入</p>
            <p class="hint">也可以点「最近刷新」快速加</p>
          </div>

          <div v-else class="tray-list">
            <div v-for="k in selected" :key="keyOf(k.songId, k.difficulty)" class="tray-item">
              <img :src="getCoverUrl(k.songId)" class="ti-cover" loading="lazy" @error="hideImg" />
              <div class="ti-main">
                <span class="ti-title">{{ songTitle(k.songId) }}</span>
                <span class="ti-meta">
                  <i class="diff-pill" :class="'d-' + k.difficulty">{{ DIFFICULTY_LABEL_SHORT[k.difficulty] }}</i>
                  <span class="ti-const">{{ bestOf(k.songId, k.difficulty)?.constant?.toFixed(1) ?? '?' }}</span>
                  <span class="ti-ach">{{ bestOf(k.songId, k.difficulty)?.achievements.toFixed(2) }}%</span>
                </span>
              </div>
              <button class="ti-del" @click="toggle(k.songId, k.difficulty)">×</button>
            </div>
          </div>

          <button class="primary-btn run-btn" :disabled="!canRun" @click="run">
            {{ running ? '分析中…' : `开始分析（${selected.length} 首）` }}
          </button>
          <p v-if="selected.length < MIN" class="tray-hint">至少选 {{ MIN }} 首</p>
          <p v-else class="tray-hint">
            基准：B50 平均 {{ b50Avg.toFixed(2) }}% · 平均定数 {{ b50AvgConst.toFixed(2) }}
          </p>
          <p v-if="flashMsg" class="flash">{{ flashMsg }}</p>
        </aside>
      </div>

      <!-- ===== 报告 ===== -->
      <template v-if="report">
        <section class="report-head card-static">
          <div class="rh-left">
            <span class="cap">SELECTION REVIEW</span>
            <h3>这 {{ report.summary.count }} 首的复盘</h3>
            <p class="rh-note">
              达成率取水鱼<b>历史最好成绩</b>，不是本次成绩；「刷新 N 次」是成绩被记录到的次数，不是游玩次数。
            </p>
          </div>
          <div class="rh-stats">
            <div v-for="s in reportStats" :key="s.label" class="rh-stat">
              <span class="rs-label">{{ s.label }}</span>
              <span class="rs-value">{{ s.value }}</span>
            </div>
          </div>
        </section>

        <!-- 两个重点 -->
        <div class="highlight-grid">
          <section class="card-static hl-card">
            <div class="hl-head">
              <span class="hl-tag gain">进步最大</span>
              <span v-if="report.biggestGain?.gain != null" class="hl-big up">{{ fmtSigned(report.biggestGain.gain) }}pt</span>
            </div>
            <template v-if="report.biggestGain">
              <div class="hl-body">
                <img :src="report.biggestGain.coverUrl" class="hl-cover" loading="lazy" @error="hideImg" />
                <div class="hl-info">
                  <span class="hl-title">{{ report.biggestGain.title }}</span>
                  <span class="hl-meta">
                    <i class="diff-pill" :class="'d-' + report.biggestGain.difficulty">{{ DIFFICULTY_LABEL_SHORT[report.biggestGain.difficulty] }}</i>
                    <span>{{ report.biggestGain.constant?.toFixed(1) }}</span>
                    <span class="hl-flow">
                      {{ report.biggestGain.firstAchievement?.toFixed(2) }}% → {{ report.biggestGain.achievements.toFixed(2) }}%
                    </span>
                  </span>
                  <span class="hl-sub">历史记录 {{ report.biggestGain.historyCount }} 次刷新</span>
                </div>
              </div>
            </template>
            <p v-else class="hl-empty">本次选中的谱面里没有可对比的历史记录（每首至少要有 2 条）。</p>
          </section>

          <section class="card-static hl-card">
            <div class="hl-head">
              <span class="hl-tag near">就差一点点</span>
              <span v-if="report.nearMiss?.next" class="hl-big near-gap">{{ report.nearMiss.next.gap.toFixed(2) }}pt</span>
            </div>
            <template v-if="report.nearMiss">
              <div class="hl-body">
                <img :src="report.nearMiss.coverUrl" class="hl-cover" loading="lazy" @error="hideImg" />
                <div class="hl-info">
                  <span class="hl-title">{{ report.nearMiss.title }}</span>
                  <span class="hl-meta">
                    <i class="diff-pill" :class="'d-' + report.nearMiss.difficulty">{{ DIFFICULTY_LABEL_SHORT[report.nearMiss.difficulty] }}</i>
                    <span>{{ report.nearMiss.constant?.toFixed(1) }}</span>
                    <span class="hl-flow">{{ report.nearMiss.achievements.toFixed(2) }}%</span>
                  </span>
                  <span class="hl-sub">
                    距「{{ report.nearMiss.next?.label }}」还差
                    <b>{{ report.nearMiss.next?.gap.toFixed(2) }}</b>pt
                  </span>
                </div>
              </div>
            </template>
            <p v-else class="hl-empty">本次选中的谱面里没有距离下一个里程碑 ≤ 1pt 的。</p>
          </section>
        </div>

        <!-- 结论 + 类型 -->
        <div class="two-col">
          <section class="card-static">
            <div class="sec-head">
              <h3>结论</h3>
              <span class="sec-hint">规则生成 · 相对你的 B50</span>
            </div>
            <ul class="verdict-list">
              <li v-for="(v, i) in report.verdicts" :key="i"><i class="dot" />{{ v }}</li>
            </ul>
          </section>

          <section class="card-static">
            <div class="sec-head">
              <h3>类型构成</h3>
              <span class="sec-hint">社区标注 · 仅列 ≥2 张</span>
            </div>
            <div v-if="report.tags.length" class="tag-cloud">
              <span v-for="t in report.tags" :key="t.tagId" class="type-chip">
                <span class="tc-name">{{ t.name }}</span>
                <span class="tc-count">{{ t.count }} 张</span>
                <span v-if="t.avgOwnDelta != null" class="tc-delta" :class="toneOf(t.avgOwnDelta)">{{ fmtSigned(t.avgOwnDelta) }}</span>
              </span>
            </div>
            <p v-else class="list-empty">这些谱面没有足够的社区标注</p>
          </section>
        </div>

        <!-- 明细 -->
        <section class="card-static detail">
          <div class="sec-head">
            <h3>逐曲明细</h3>
            <span class="sec-hint">按达成率降序 · Δ = 该谱达成率 − 你的 B50 平均</span>
          </div>
          <div class="detail-list">
            <div class="detail-row head">
              <span class="dc-song">曲目</span>
              <span class="dc-ach">达成率</span>
              <span class="dc-delta">Δ vs B50</span>
              <span class="dc-progress">历史提升</span>
              <span class="dc-next">下一里程碑</span>
            </div>
            <div v-for="c in report.charts" :key="keyOf(c.songId, c.difficulty)" class="detail-row">
              <div class="dc-song">
                <img :src="c.coverUrl" class="dr-cover" loading="lazy" @error="hideImg" />
                <div class="dr-main">
                  <span class="dr-title">{{ c.title }}</span>
                  <span class="dr-meta">
                    <i class="diff-pill" :class="'d-' + c.difficulty">{{ DIFFICULTY_LABEL_SHORT[c.difficulty] }}</i>
                    <span class="dr-const">{{ c.constant?.toFixed(1) }}</span>
                    <span v-for="t in c.tags.slice(0, 2)" :key="t.id" class="mini-tag">{{ t.name }}</span>
                  </span>
                </div>
              </div>

              <div class="dc-ach">
                <b>{{ c.achievements.toFixed(2) }}%</b>
                <span class="rate">{{ c.rate }}</span>
              </div>

              <div class="dc-delta">
                <span v-if="c.ownDelta != null" class="delta-wrap">
                  <span class="delta-track">
                    <i class="delta-zero" />
                    <i
                      class="delta-fill"
                      :class="toneOf(c.ownDelta)"
                      :style="deltaStyle(c.ownDelta)"
                    />
                  </span>
                  <b :class="toneOf(c.ownDelta)">{{ fmtSigned(c.ownDelta) }}</b>
                </span>
                <span v-else class="muted">—</span>
              </div>

              <div class="dc-progress">
                <span v-if="c.gain != null && c.gain > 0.05" class="gain-badge up">↑ {{ fmtSigned(c.gain) }}</span>
                <span v-else-if="c.historyCount >= 2" class="muted">持平</span>
                <span v-else class="muted" :title="`只有 ${c.historyCount} 条记录，无法对比`">—</span>
              </div>

              <div class="dc-next">
                <template v-if="c.next">
                  <span class="next-label">{{ c.next.label }}</span>
                  <span class="next-gap" :class="{ near: c.next.gap <= 0.5 }">差 {{ c.next.gap.toFixed(2) }}</span>
                </template>
                <span v-else class="next-max">已满</span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { useB50Store } from '@/stores/useB50Store';
import { useTagStore } from '@/stores/useTagStore';
import { useAnalysisStore } from '@/stores/useAnalysisStore';
import { analyzeSelection } from '@/utils/selectionAnalysis';
import { fmtSigned } from '@/utils/b50Diff';
import { collapseByChart } from '@/utils/b50Collapse';
import { isPlausibleAchievement } from '@/utils/rating';
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_LABEL_SHORT,
  DIFFICULTY_LIST,
  getConstByDifficulty,
  type DifficultyType,
  type SongMeta,
} from '@/types/song';
import { normalizeTitle } from '@/types/tag';
import { getCoverUrl } from '@/types/sync';
import type { ChartKey, SelectionReport } from '@/types/selection';

const MAX = 16;
const MIN = 3;
const STORAGE_KEY = 'growth_selection_v1';

const songStore = useSongStore();
const playLogStore = usePlayLogStore();
const b50Store = useB50Store();
const tagStore = useTagStore();
const analysisStore = useAnalysisStore();

const query = ref('');
const selected = ref<ChartKey[]>(loadSelection());
const report = ref<SelectionReport | null>(null);
const running = ref(false);
const preparing = ref(false);
const flashMsg = ref('');

const keyOf = (songId: number, difficulty: string) => `${songId}_${difficulty}`;

function loadSelection(): ChartKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(k => k && typeof k.songId === 'number') : [];
  } catch {
    return [];
  }
}

watch(selected, v => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}, { deep: true });

/** 每个谱面的最优成绩（先剔除脏数据，避免 188% 这种值出现在选择器里） */
const bestByChart = computed(() =>
  new Map(
    collapseByChart(playLogStore.records.filter(r => isPlausibleAchievement(r.achievements)))
      .map(r => [keyOf(r.songId, r.difficulty), r]),
  ),
);

/** 最近被记录到成绩的谱面（playTime = 同步时刻，不是游玩顺序） */
const recent = computed(() =>
  [...bestByChart.value.values()]
    .sort((a, b) => b.playTime.localeCompare(a.playTime))
    .slice(0, 10),
);

const pool = computed<SongMeta[]>(() => {
  const all = [...songStore.songs.values()];
  const q = normalizeTitle(query.value);
  if (q) {
    return all
      .filter(s => normalizeTitle(s.title).includes(q) || normalizeTitle(s.artist).includes(q))
      .slice(0, 40);
  }
  // 默认：有成绩的曲目，按最近刷新排序
  const seen = new Set<number>();
  const out: SongMeta[] = [];
  for (const r of [...bestByChart.value.values()].sort((a, b) => b.playTime.localeCompare(a.playTime))) {
    if (seen.has(r.songId)) continue;
    const s = songStore.songs.get(r.songId);
    if (!s) continue;
    seen.add(r.songId);
    out.push(s);
    if (out.length >= 40) break;
  }
  return out;
});

const b50Avg = computed(() => analysisStore.result?.structure.avgAchievement ?? 0);
const b50AvgConst = computed(() => analysisStore.result?.structure.avgConstant ?? 0);
const canRun = computed(() => selected.value.length >= MIN && selected.value.length <= MAX && !running.value);

function chartsOf(song: SongMeta) {
  // 只列**有成绩**的难度：没打过的难度既不能选，又会把标题挤窄
  return DIFFICULTY_LIST
    .map(d => ({
      d,
      constant: getConstByDifficulty(song, d),
      best: bestByChart.value.get(keyOf(song.songId, d)) ?? null,
    }))
    .filter(c => c.constant != null && c.best != null);
}

function bestOf(songId: number, difficulty: DifficultyType) {
  return bestByChart.value.get(keyOf(songId, difficulty)) ?? null;
}

function songTitle(songId: number): string {
  return songStore.songs.get(songId)?.title ?? `#${songId}`;
}

function isSelected(songId: number, difficulty: DifficultyType): boolean {
  return selected.value.some(k => k.songId === songId && k.difficulty === difficulty);
}

function toggle(songId: number, difficulty: DifficultyType) {
  if (!bestByChart.value.has(keyOf(songId, difficulty))) {
    flashMsg.value = '这个难度没有成绩记录，先打一把再来。';
    return;
  }
  if (isSelected(songId, difficulty)) {
    selected.value = selected.value.filter(k => !(k.songId === songId && k.difficulty === difficulty));
    report.value = null;
    flashMsg.value = '';
    return;
  }
  if (selected.value.length >= MAX) {
    flashMsg.value = `最多选 ${MAX} 首。`;
    return;
  }
  selected.value = [...selected.value, { songId, difficulty }];
  report.value = null;
  flashMsg.value = '';
}

function clearAll() {
  selected.value = [];
  report.value = null;
}

function toneOf(v: number): 'up' | 'down' | 'flat' {
  if (v > 0.0001) return 'up';
  if (v < -0.0001) return 'down';
  return 'flat';
}

function deltaStyle(v: number) {
  const w = Math.min(50, (Math.abs(v) / 2) * 50);
  return v >= 0 ? { left: '50%', width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` };
}

function hideImg(e: Event) {
  (e.target as HTMLImageElement).style.visibility = 'hidden';
}

const reportStats = computed(() => {
  const r = report.value;
  if (!r) return [];
  const s = r.summary;
  return [
    { label: '平均达成', value: s.avgAchievement.toFixed(2) + '%' },
    { label: '平均定数', value: s.avgConstant.toFixed(2) },
    { label: '相对 B50', value: s.avgOwnDelta != null ? fmtSigned(s.avgOwnDelta) : '—' },
    { label: '鸟 / 鸟加', value: `${s.birdCount} / ${s.birdPlusCount}` },
  ];
});

async function prepare() {
  preparing.value = true;
  try {
    await analysisStore.runAnalysis();
  } finally {
    preparing.value = false;
  }
}

async function run() {
  if (!canRun.value) return;
  running.value = true;
  flashMsg.value = '';
  try {
    if (!analysisStore.hasResult) await analysisStore.runAnalysis();
    if (!analysisStore.result) {
      flashMsg.value = 'B50 分析没有生成成功，请稍后重试。';
      return;
    }
    report.value = analyzeSelection({
      keys: selected.value,
      plays: playLogStore.records,
      b50List: b50Store.b50List,
      b50AvgAchievement: analysisStore.result.structure.avgAchievement,
      songMap: songStore.songs,
      getTags: (songId, d) => tagStore.getTags(songId, d),
    });
    if (report.value.charts.length < selected.value.length) {
      flashMsg.value = `有 ${selected.value.length - report.value.charts.length} 首没有本地成绩，已跳过。`;
    }
  } finally {
    running.value = false;
  }
}

onMounted(async () => {
  await Promise.all([
    songStore.loadFromDB(),
    playLogStore.loadFromDB(),
    b50Store.loadFromDB(),
  ]);
  tagStore.load().catch(() => {});
});
</script>

<style scoped>
.sel { display: flex; flex-direction: column; gap: 16px; }

/* ===== 门槛 ===== */
.gate {
  padding: 44px 28px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.gate-badge {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center;
  font-size: 24px; color: var(--color-primary);
  background: linear-gradient(135deg, rgba(74,114,255,0.12), rgba(157,123,255,0.14));
}
.gate h3 { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.gate p { font-size: 13px; color: var(--text-secondary); line-height: 1.7; max-width: 480px; }
.gate b { color: var(--text-primary); }
.gate-err { color: var(--color-danger) !important; font-size: 12px !important; }
.primary-btn {
  margin-top: 8px; padding: 9px 20px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 14px rgba(74, 114, 255, 0.28);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(74, 114, 255, 0.34); }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 选曲 ===== */
.pick-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.picker { padding: 18px 20px; min-width: 0; }
.picker-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.picker-head h3 { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.hint { font-size: 10.5px; color: var(--text-muted); }

.search-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 11px;
  background: rgba(255,255,255,0.75); border: 1px solid rgba(74,114,255,0.12);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.search-row:focus-within { border-color: rgba(74,114,255,0.4); box-shadow: 0 0 0 3px rgba(74,114,255,0.08); }
.search-icon { display: flex; color: var(--text-muted); }
.search-input { flex: 1; border: none; background: transparent; outline: none; font-size: 12.5px; color: var(--text-primary); }
.search-input::placeholder { color: var(--text-muted); }
.clear-btn { border: none; background: transparent; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 2px 4px; }
.clear-btn:hover { color: var(--color-primary); }

.quick-block { margin-top: 12px; }
.quick-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; }
.quick-list { display: flex; gap: 6px; overflow-x: auto; padding: 7px 0 3px; scrollbar-width: thin; }
.quick-chip {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
  padding: 5px 10px; border-radius: 9px; cursor: pointer;
  border: 1px solid rgba(74,114,255,0.12); background: rgba(255,255,255,0.6);
  transition: all var(--transition-fast); max-width: 150px;
}
.quick-chip:hover { border-color: rgba(74,114,255,0.35); background: #fff; }
.quick-chip.on { border-color: var(--color-primary); background: rgba(74,114,255,0.08); }
.qc-title { font-size: 10.5px; font-weight: 600; color: var(--text-primary); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qc-meta { font-size: 9.5px; color: var(--text-muted); }
.quick-note { font-size: 9.5px; color: var(--text-muted); margin-top: 2px; }

.song-list { margin-top: 12px; max-height: 430px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.song-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 8px; border-radius: 10px;
  transition: background var(--transition-fast);
}
.song-item:hover { background: rgba(255,255,255,0.7); }
.si-cover { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: var(--bg-body); }
.si-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.si-title { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.si-artist { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.si-charts { display: flex; gap: 4px; flex-shrink: 0; }
.chart-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 7px; border-radius: 7px; cursor: pointer;
  border: 1px solid rgba(74,114,255,0.12); background: rgba(255,255,255,0.6);
  transition: all var(--transition-fast);
}
.chart-pill:hover:not(:disabled) { border-color: rgba(74,114,255,0.4); }
.chart-pill.on { border-color: var(--color-primary); background: rgba(74,114,255,0.10); box-shadow: 0 0 0 2px rgba(74,114,255,0.10); }
.chart-pill.empty { opacity: 0.35; cursor: not-allowed; }
.cp-diff { font-style: normal; font-size: 8.5px; font-weight: 800; color: var(--text-muted); }
.cp-const { font-size: 10.5px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.cp-ach { font-size: 9.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.list-empty { font-size: 11.5px; color: var(--text-muted); padding: 10px 0; text-align: center; }

/* ===== 托盘 ===== */
.tray {
  padding: 18px 16px; position: sticky; top: 0;
  display: flex; flex-direction: column; gap: 10px;
  max-height: calc(100vh - 140px);
}
.tray-head { display: flex; align-items: baseline; justify-content: space-between; }
.tray-head h3 { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.tray-head b { font-size: 17px; color: var(--color-primary); }
.tray-empty { padding: 24px 0; text-align: center; display: flex; flex-direction: column; gap: 4px; }
.te-icon { font-size: 22px; color: var(--text-muted); }
.tray-empty p { font-size: 11.5px; color: var(--text-secondary); }
.tray-empty .hint { font-size: 10px; color: var(--text-muted); }
.tray-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; min-height: 60px; }
.tray-item { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 8px; }
.tray-item:hover { background: rgba(255,255,255,0.6); }
.ti-cover { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--bg-body); }
.ti-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ti-title { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ti-meta { display: flex; align-items: center; gap: 5px; }
.ti-const { font-size: 9.5px; color: var(--text-muted); }
.ti-ach { font-size: 9.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ti-del { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 13px; padding: 0 3px; }
.ti-del:hover { color: var(--color-danger); }
.run-btn { width: 100%; margin-top: 2px; }
.tray-hint { font-size: 10px; color: var(--text-muted); text-align: center; line-height: 1.5; }
.flash { font-size: 10.5px; color: var(--color-warning); text-align: center; }

/* ===== 报告 ===== */
.report-head { padding: 20px 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.cap { font-size: 9.5px; font-weight: 800; letter-spacing: 0.14em; color: var(--text-muted); }
.rh-left h3 { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 4px 0 6px; letter-spacing: var(--letter-spacing-tight); }
.rh-note { font-size: 10.5px; color: var(--text-muted); line-height: 1.6; max-width: 520px; }
.rh-note b { color: var(--text-secondary); }
.rh-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.rh-stat { padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.55); border: 1px solid rgba(255,255,255,0.9); text-align: center; min-width: 76px; }
.rs-label { display: block; font-size: 9.5px; color: var(--text-muted); }
.rs-value { font-size: 14px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.highlight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.hl-card { padding: 16px 18px; }
.hl-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.hl-tag { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
.hl-tag.gain { color: var(--color-success); background: rgba(16,185,129,0.10); }
.hl-tag.near { color: var(--color-warning); background: rgba(245,158,11,0.12); }
.hl-big { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.hl-big.near-gap { color: var(--color-warning); }
.hl-body { display: flex; align-items: center; gap: 12px; }
.hl-cover { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; background: var(--bg-body); }
.hl-info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.hl-title { font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hl-meta { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--text-muted); }
.hl-flow { font-variant-numeric: tabular-nums; }
.hl-sub { font-size: 10.5px; color: var(--text-secondary); }
.hl-sub b { color: var(--text-primary); }
.hl-empty { font-size: 11.5px; color: var(--text-muted); line-height: 1.6; padding: 8px 0; }

.two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.two-col > section { padding: 18px 20px; }
.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.sec-head h3 { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.sec-hint { font-size: 10.5px; color: var(--text-muted); }
.verdict-list { display: flex; flex-direction: column; gap: 8px; }
.verdict-list li { display: flex; gap: 8px; font-size: 12px; line-height: 1.55; color: var(--text-secondary); }
.verdict-list .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-primary); margin-top: 6px; flex-shrink: 0; }

.tag-cloud { display: flex; flex-wrap: wrap; gap: 7px; }
.type-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 9px;
  background: rgba(74,114,255,0.06); border: 1px solid rgba(74,114,255,0.10);
}
.tc-name { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.tc-count { font-size: 9.5px; color: var(--text-muted); }
.tc-delta { font-size: 9.5px; font-weight: 700; }

/* ===== 明细 ===== */
.detail { padding: 18px 20px; }
.detail-list { display: flex; flex-direction: column; }
.detail-row {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 84px 118px 86px 110px;
  align-items: center; gap: 10px;
  padding: 8px 6px; border-radius: 9px;
  transition: background var(--transition-fast);
}
.detail-row:not(.head):hover { background: rgba(255,255,255,0.65); }
.detail-row.head { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid rgba(74,114,255,0.08); border-radius: 0; padding-bottom: 6px; }
.dc-song { display: flex; align-items: center; gap: 9px; min-width: 0; }
.dr-cover { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; flex-shrink: 0; background: var(--bg-body); }
.dr-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dr-title { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dr-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.dr-const { font-size: 9.5px; color: var(--text-muted); }
.mini-tag { font-size: 8.5px; color: var(--text-muted); padding: 1px 4px; border-radius: 4px; background: rgba(74,114,255,0.06); }
.dc-ach { display: flex; flex-direction: column; gap: 1px; }
.dc-ach b { font-size: 12px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.dc-ach .rate { font-size: 9px; color: var(--text-muted); }
.delta-wrap { display: flex; align-items: center; gap: 6px; }
.delta-track { position: relative; flex: 1; height: 5px; border-radius: 999px; background: rgba(74,114,255,0.07); overflow: hidden; }
.delta-zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(75,85,99,0.25); }
.delta-fill { position: absolute; top: 0; bottom: 0; border-radius: 999px; }
.delta-fill.up { background: var(--color-success); }
.delta-fill.down { background: var(--color-danger); }
.delta-wrap b { font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dc-progress { font-size: 10.5px; }
.gain-badge { font-weight: 700; padding: 2px 7px; border-radius: 6px; background: rgba(16,185,129,0.09); }
.dc-next { display: flex; flex-direction: column; gap: 1px; }
.next-label { font-size: 10px; color: var(--text-secondary); }
.next-gap { font-size: 9.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.next-gap.near { color: var(--color-warning); font-weight: 700; }
.next-max { font-size: 10px; color: var(--color-success); }
.muted { color: var(--text-muted); font-size: 10.5px; }
.up { color: var(--color-success); }
.down { color: var(--color-danger); }
.flat { color: var(--text-muted); }

.diff-pill { font-style: normal; font-size: 8.5px; font-weight: 800; padding: 1px 4px; border-radius: 4px; letter-spacing: 0.03em; }
.d-master { color: #7C3AED; background: rgba(139,92,246,0.12); }
.d-remaster { color: #DB2777; background: rgba(236,72,153,0.12); }
.d-expert { color: #DC2626; background: rgba(239,68,68,0.12); }
.d-advanced { color: #B45309; background: rgba(245,158,11,0.14); }
.d-basic { color: #047857; background: rgba(16,185,129,0.12); }

@media (max-width: 1180px) {
  .pick-grid { grid-template-columns: minmax(0, 1fr); }
  .tray { position: static; max-height: none; }
}
@media (max-width: 980px) {
  .highlight-grid, .two-col { grid-template-columns: minmax(0, 1fr); }
  .detail-row { grid-template-columns: minmax(0, 2fr) 78px 100px 78px; }
  .dc-next { display: none; }
  .rh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .detail-row { grid-template-columns: minmax(0, 1fr) 78px 96px; }
  .dc-progress { display: none; }
  .si-charts { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
