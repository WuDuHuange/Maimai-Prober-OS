<template>
  <div class="evo">
    <!-- ===== 工具条 ===== -->
    <div class="toolbar card-static">
      <div v-if="entries.length >= 2" class="compare-pick">
        <span class="tool-label">对比</span>
        <select class="snap-select" :value="fromId ?? ''" @change="onFromChange">
          <option v-for="e in fromOptions" :key="e.id" :value="e.id">{{ snapLabel(e) }}</option>
        </select>
        <span class="arrow">→</span>
        <select class="snap-select" :value="toId ?? ''" @change="onToChange">
          <option v-for="e in toOptions" :key="e.id" :value="e.id">{{ snapLabel(e) }}</option>
        </select>
      </div>
      <div class="tool-right">
        <span class="snap-count">已存 {{ entries.length }} 份</span>
        <button class="ghost-btn" :disabled="saving || b50Store.b50List.length === 0" @click="saveNow">
          {{ saving ? '保存中…' : '保存当前 B50' }}
        </button>
      </div>
    </div>

    <p v-if="message" class="save-msg" :class="message.tone">{{ message.text }}</p>

    <!-- ===== 空状态：不足两份 ===== -->
    <div v-if="!diff" class="empty card-static">
      <div class="empty-badge">◷</div>
      <h3>还差一份快照</h3>
      <p v-if="entries.length === 0">
        当前还没有历史快照。同步成绩时系统会自动存一份，你也可以先手动存下现在的 B50 作为基线。
      </p>
      <p v-else>
        已经存下基线。等下一次同步（成绩有变化）后，这里会自动出现「上一次 → 这一次」的对比。
      </p>
      <button class="primary-btn" :disabled="saving" @click="saveNow">保存当前 B50</button>
      <p class="hint">内容与最新快照完全一致时不会重复存；最多保留 40 份。</p>
    </div>

    <template v-else>
      <!-- ===== Hero ===== -->
      <section class="hero card-static">
        <div class="hero-main">
          <div class="hero-rating">
            <span class="cap">RATING</span>
            <div class="rating-flow">
              <span class="from">{{ fromEntry!.rating.toFixed(0) }}</span>
              <svg class="flow-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span class="to">{{ toEntry!.rating.toFixed(0) }}</span>
              <span class="rating-delta" :class="toneOf(diff.rating.delta)">{{ fmtSigned(diff.rating.delta, 0) }}</span>
            </div>
            <span class="period">{{ fmtTime(fromEntry!.capturedAt) }} → {{ fmtTime(toEntry!.capturedAt) }}</span>
          </div>
          <div class="verdict" :class="verdictMeta.cls">
            <span class="verdict-label">{{ verdictMeta.label }}</span>
            <span class="verdict-desc">{{ verdictMeta.desc }}</span>
          </div>
        </div>
        <div class="hero-stats">
          <div v-for="s in heroStats" :key="s.label" class="hero-stat">
            <span class="hs-label">{{ s.label }}</span>
            <span class="hs-value">{{ s.to }}<i v-if="s.from && s.from !== s.to" class="hs-from">← {{ s.from }}</i></span>
            <span class="hs-delta" :class="s.tone">{{ s.delta }}</span>
          </div>
        </div>
      </section>

      <!-- ===== 结论 ===== -->
      <section class="card-static narrative">
        <div class="sec-head">
          <h3>这段时间发生了什么</h3>
          <span class="sec-hint">规则生成 · 只陈述有数据支撑的事实</span>
        </div>
        <ul class="narrative-list">
          <li v-for="(n, i) in diff.narrative" :key="i" :class="n.tone">
            <i class="dot" />{{ n.text }}
          </li>
        </ul>
      </section>

      <!-- ===== 六维 ===== -->
      <div class="two-col">
        <section class="card-static">
          <div class="sec-head">
            <h3>六维变化</h3>
            <span class="sec-hint">实线 = 现在 · 虚线 = 上一次</span>
          </div>
          <AbilityRadarChart
            v-if="diff.dimensions"
            :dimensions="currentDims"
            :compare="prevScores"
            :height="288"
          />
          <div v-else class="no-ability">
            <p>这两份快照至少有一份没有六维数据。</p>
            <p class="hint">六维依赖当时的全量成绩（硬度要看 B50 外的硬谱），历史无法重算 —— 所以只对比结构，不猜强弱。</p>
          </div>
        </section>

        <section class="card-static">
          <div class="sec-head">
            <h3>维度明细</h3>
            <span class="sec-hint">0–100</span>
          </div>
          <div v-if="diff.dimensions" class="dim-list">
            <div v-for="d in diff.dimensions" :key="d.id" class="dim-item">
              <span class="dim-name">{{ d.label }}</span>
              <span class="dim-track">
                <i class="dim-fill" :style="{ width: d.to + '%' }" />
                <i class="dim-mark" :style="{ left: d.from + '%' }" :title="`上次 ${d.from}`" />
              </span>
              <span class="dim-pair">{{ d.from }}<b>→</b>{{ d.to }}</span>
              <span class="dim-delta" :class="toneOf(d.delta)">{{ fmtSigned(d.delta, 0) }}</span>
            </div>
          </div>
          <p v-else class="no-ability">—</p>
        </section>
      </div>

      <!-- ===== 换血 ===== -->
      <section class="card-static turnover">
        <div class="sec-head">
          <h3>B50 换血</h3>
          <span class="sec-hint">
            新进 {{ diff.entered.length }} · 掉出 {{ diff.exited.length }} · 保留 {{ diff.keptCount }}
            <template v-if="diff.improved.length"> · 同谱刷新 {{ diff.improved.length }}</template>
          </span>
        </div>

        <div class="turn-grid">
          <div class="turn-col">
            <h4 class="turn-title up">新进 <span>{{ diff.entered.length }}</span></h4>
            <p v-if="diff.entered.length === 0" class="turn-empty">这次没有新曲进榜</p>
            <div v-for="c in diff.entered.slice(0, 12)" :key="chartKey(c)" class="chart-row">
              <img :src="getCoverUrl(c.songId)" class="row-cover" loading="lazy" @error="hideImg" />
              <div class="row-main">
                <span class="row-title">{{ c.title }}</span>
                <span class="row-meta">
                  <i class="diff-pill" :class="'d-' + c.difficulty">{{ DIFFICULTY_LABEL_SHORT[c.difficulty] }}</i>
                  <span class="row-const">{{ c.constant?.toFixed(1) ?? '?' }}</span>
                  <span v-for="t in c.tagNames.slice(0, 2)" :key="t" class="mini-tag">{{ t }}</span>
                </span>
              </div>
              <span class="row-ach">{{ c.achievements.toFixed(2) }}%</span>
            </div>
            <p v-if="diff.entered.length > 12" class="turn-more">还有 {{ diff.entered.length - 12 }} 张…</p>
          </div>

          <div class="turn-col">
            <h4 class="turn-title down">掉出 <span>{{ diff.exited.length }}</span></h4>
            <p v-if="diff.exited.length === 0" class="turn-empty">没有曲目掉出</p>
            <div v-for="c in diff.exited.slice(0, 12)" :key="chartKey(c)" class="chart-row muted">
              <img :src="getCoverUrl(c.songId)" class="row-cover" loading="lazy" @error="hideImg" />
              <div class="row-main">
                <span class="row-title">{{ c.title }}</span>
                <span class="row-meta">
                  <i class="diff-pill" :class="'d-' + c.difficulty">{{ DIFFICULTY_LABEL_SHORT[c.difficulty] }}</i>
                  <span class="row-const">{{ c.constant?.toFixed(1) ?? '?' }}</span>
                  <span v-for="t in c.tagNames.slice(0, 2)" :key="t" class="mini-tag">{{ t }}</span>
                </span>
              </div>
              <span class="row-ach">{{ c.achievements.toFixed(2) }}%</span>
            </div>
            <p v-if="diff.exited.length > 12" class="turn-more">还有 {{ diff.exited.length - 12 }} 张…</p>
          </div>
        </div>

        <div v-if="diff.improved.length > 0" class="improved">
          <h4 class="turn-title flat">同谱刷新 <span>{{ diff.improved.length }}</span></h4>
          <div class="improve-chips">
            <span v-for="c in diff.improved.slice(0, 10)" :key="chartKey(c)" class="improve-chip" :title="`${c.title} ${DIFFICULTY_LABEL_SHORT[c.difficulty]} → ${c.achievements.toFixed(2)}%`">
              {{ c.title }}
              <b class="up">{{ fmtSigned(c.delta) }}</b>
            </span>
          </div>
        </div>
      </section>

      <!-- ===== 时间线 ===== -->
      <section class="card-static timeline">
        <div class="sec-head">
          <h3>快照时间线</h3>
          <span class="sec-hint">点任意一行回到那次对比 · 最多 40 份</span>
        </div>
        <div class="tl-scroll">
          <div
            v-for="(e, i) in reversedEntries"
            :key="e.id"
            class="tl-row"
            :class="{ active: e.id === toId, base: i === reversedEntries.length - 1 }"
            @click="jumpTo(e)"
          >
            <span class="tl-dot" />
            <span class="tl-time">{{ fmtTime(e.capturedAt) }}</span>
            <span class="tl-rating">R.T. {{ e.rating.toFixed(0) }}</span>
            <span class="tl-delta" :class="toneOf(prevRating(e) == null ? 0 : e.rating - prevRating(e)!)">
              {{ prevRating(e) == null ? '基线' : fmtSigned(e.rating - prevRating(e)!, 0) }}
            </span>
            <span class="tl-ability" :class="{ on: !!e.ability }">{{ e.ability ? '六维 ✓' : '无六维' }}</span>
            <span class="tl-src">{{ SOURCE_LABEL[e.source] }}</span>
            <button class="tl-del" title="删除这份快照" @click.stop="remove(e)">×</button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useB50HistoryStore } from '@/stores/useB50HistoryStore';
import { useB50Store } from '@/stores/useB50Store';
import { useSongStore } from '@/stores/useSongStore';
import { useTagStore } from '@/stores/useTagStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { diffSnapshots, fmtSigned } from '@/utils/b50Diff';
import { DIFFICULTY_LABEL_SHORT } from '@/types/song';
import { getCoverUrl } from '@/types/sync';
import type { B50HistoryEntry, ChartMove, TrendVerdict } from '@/types/b50History';
import AbilityRadarChart from '@/components/charts/AbilityRadarChart.vue';

const historyStore = useB50HistoryStore();
const b50Store = useB50Store();
const songStore = useSongStore();
const tagStore = useTagStore();
const playerStore = usePlayerStore();

const fromId = ref<number | null>(null);
const toId = ref<number | null>(null);
const saving = ref(false);
const message = ref<{ text: string; tone: 'ok' | 'warn' } | null>(null);

const entries = computed(() => historyStore.entries);
/** 「起点」不能是最新一份（它后面没有可对比的对象） */
const fromOptions = computed(() =>
  entries.value.length >= 2 ? entries.value.slice(0, -1) : entries.value,
);
const fromIndex = computed(() => entries.value.findIndex(e => e.id === fromId.value));
const toOptions = computed(() =>
  fromIndex.value >= 0 ? entries.value.slice(fromIndex.value + 1) : entries.value,
);
const fromEntry = computed(() => entries.value.find(e => e.id === fromId.value) ?? null);
const toEntry = computed(() => entries.value.find(e => e.id === toId.value) ?? null);
const reversedEntries = computed(() => [...entries.value].reverse());

const diff = computed(() => {
  if (!fromEntry.value || !toEntry.value || fromEntry.value.id === toEntry.value.id) return null;
  return diffSnapshots(
    fromEntry.value,
    toEntry.value,
    songStore.songs,
    (songId, d) => tagStore.getTags(songId, d),
  );
});

const currentDims = computed(() =>
  (diff.value?.dimensions ?? []).map(d => ({ label: d.label, score: d.to })),
);
const prevScores = computed(() => (diff.value?.dimensions ?? []).map(d => d.from));

const VERDICT_META: Record<TrendVerdict, { label: string; desc: string; cls: string }> = {
  strength: { label: '在延续强项', desc: '强项的涨幅高于弱项 —— 这段时间主要在把擅长的事做得更稳', cls: 'v-strength' },
  weakness: { label: '在补弱项', desc: '弱项的涨幅高于强项 —— 这段时间主要在补短板', cls: 'v-weakness' },
  mixed: { label: '两头都在动', desc: '强项与弱项变化接近，暂时看不出明确取向', cls: 'v-mixed' },
  unknown: { label: '只看结构', desc: '缺少六维数据，不判断强弱迁移', cls: 'v-unknown' },
};
const verdictMeta = computed(() => VERDICT_META[diff.value?.verdict ?? 'unknown']);

const heroStats = computed(() => {
  const d = diff.value;
  if (!d) return [];
  const s = d.structure;
  return [
    { label: '平均定数', from: s.avgConstant.from.toFixed(2), to: s.avgConstant.to.toFixed(2), delta: fmtSigned(s.avgConstant.delta, 2), tone: toneOf(s.avgConstant.delta) },
    { label: '平均达成', from: s.avgAchievement.from.toFixed(2) + '%', to: s.avgAchievement.to.toFixed(2) + '%', delta: fmtSigned(s.avgAchievement.delta, 2) + 'pt', tone: toneOf(s.avgAchievement.delta) },
    { label: '鸟加', from: String(s.birdPlus.from), to: String(s.birdPlus.to), delta: fmtSigned(s.birdPlus.delta, 0) + ' 张', tone: toneOf(s.birdPlus.delta) },
    { label: '换血', from: '', to: `${d.entered.length} 进 / ${d.exited.length} 出`, delta: `保留 ${d.keptCount} 张`, tone: 'flat' },
  ];
});

const SOURCE_LABEL: Record<B50HistoryEntry['source'], string> = {
  sync: '同步自动',
  manual: '手动保存',
  bootstrap: '初始基线',
};

function toneOf(v: number): 'up' | 'down' | 'flat' {
  if (v > 0.0001) return 'up';
  if (v < -0.0001) return 'down';
  return 'flat';
}

function snapLabel(e: B50HistoryEntry): string {
  return `${fmtTime(e.capturedAt)} · R.T. ${e.rating.toFixed(0)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('zh-CN', {
    ...(sameYear ? {} : { year: '2-digit' as const }),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function prevRating(e: B50HistoryEntry): number | null {
  const i = entries.value.findIndex(x => x.id === e.id);
  return i > 0 ? entries.value[i - 1].rating : null;
}

function chartKey(c: ChartMove): string {
  return `${c.songId}_${c.difficulty}`;
}

function hideImg(e: Event) {
  (e.target as HTMLImageElement).style.visibility = 'hidden';
}

/** 默认对比最后两份 */
function syncDefaultPair() {
  const n = entries.value.length;
  if (n === 0) {
    fromId.value = toId.value = null;
  } else if (n === 1) {
    fromId.value = toId.value = entries.value[0].id ?? null;
  } else {
    toId.value = entries.value[n - 1].id ?? null;
    fromId.value = entries.value[n - 2].id ?? null;
  }
}

function onFromChange(e: Event) {
  const id = Number((e.target as HTMLSelectElement).value);
  fromId.value = Number.isFinite(id) ? id : null;
  const i = entries.value.findIndex(x => x.id === fromId.value);
  if (i >= 0) toId.value = entries.value[i + 1]?.id ?? null;
}

function onToChange(e: Event) {
  const id = Number((e.target as HTMLSelectElement).value);
  toId.value = Number.isFinite(id) ? id : null;
}

function jumpTo(e: B50HistoryEntry) {
  const i = entries.value.findIndex(x => x.id === e.id);
  if (i <= 0) return;
  fromId.value = entries.value[i - 1].id ?? null;
  toId.value = e.id ?? null;
}

async function saveNow() {
  if (b50Store.b50List.length === 0) {
    message.value = { text: '还没有 B50 数据，请先同步战绩。', tone: 'warn' };
    return;
  }
  saving.value = true;
  message.value = null;
  try {
    const rating = playerStore.currentRating || b50Store.computedRating;
    const entry = await historyStore.capture(b50Store.b50List, rating, 'manual');
    if (entry) {
      message.value = { text: `已保存快照（R.T. ${rating.toFixed(0)}）。`, tone: 'ok' };
      syncDefaultPair();
    } else {
      message.value = { text: '内容与最新快照一致，没有新增。等成绩有变化再来。', tone: 'warn' };
    }
  } finally {
    saving.value = false;
  }
}

async function remove(e: B50HistoryEntry) {
  if (e.id == null) return;
  if (!confirm(`删除 ${fmtTime(e.capturedAt)} 的快照？此操作不可恢复。`)) return;
  await historyStore.remove(e.id);
  syncDefaultPair();
}

onMounted(async () => {
  await Promise.all([songStore.loadFromDB(), b50Store.loadFromDB()]);
  await historyStore.load();

  // 首次进入：把当前 B50 存成基线，否则用户永远只有一份、无法对比
  if (historyStore.entries.length === 0 && b50Store.b50List.length > 0) {
    const rating = playerStore.currentRating || b50Store.computedRating;
    await historyStore.capture(b50Store.b50List, rating, 'bootstrap');
    message.value = { text: '已把当前 B50 存为基线。下次同步成绩后就能看到对比。', tone: 'ok' };
  }

  syncDefaultPair();
  // tag 拉不到就静默降级：tag 列与强弱迁移会变空，但结构对比不受影响
  tagStore.load().catch(() => {});
});
</script>

<style scoped>
.evo { display: flex; flex-direction: column; gap: 16px; }

/* ===== 工具条 ===== */
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 16px; flex-wrap: wrap;
}
.compare-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tool-label { font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; }
.snap-select {
  appearance: none;
  padding: 7px 28px 7px 12px;
  border-radius: 10px;
  border: 1px solid rgba(74, 114, 255, 0.16);
  background: rgba(255, 255, 255, 0.85)
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B9BB4' stroke-width='2.5'><path d='m6 9 6 6 6-6'/></svg>")
    no-repeat right 10px center;
  font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.snap-select:hover, .snap-select:focus { border-color: rgba(74, 114, 255, 0.4); box-shadow: 0 0 0 3px rgba(74, 114, 255, 0.08); outline: none; }
.arrow { color: var(--text-muted); font-size: 13px; }
.tool-right { display: flex; align-items: center; gap: 12px; }
.snap-count { font-size: 11px; color: var(--text-muted); }
.ghost-btn {
  padding: 7px 14px; border-radius: 10px; font-size: 12px; font-weight: 600;
  color: var(--color-primary); background: rgba(74, 114, 255, 0.08);
  border: 1px solid rgba(74, 114, 255, 0.16); cursor: pointer;
  transition: all var(--transition-fast);
}
.ghost-btn:hover:not(:disabled) { background: rgba(74, 114, 255, 0.14); }
.ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.save-msg { font-size: 12px; margin: -6px 2px 0; }
.save-msg.ok { color: var(--color-success); }
.save-msg.warn { color: var(--color-warning); }

/* ===== 空状态 ===== */
.empty {
  padding: 44px 28px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.empty-badge {
  width: 52px; height: 52px; border-radius: 16px;
  display: grid; place-items: center; font-size: 22px; color: var(--color-primary);
  background: linear-gradient(135deg, rgba(74,114,255,0.12), rgba(157,123,255,0.14));
  margin-bottom: 4px;
}
.empty h3 { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.empty p { font-size: 13px; color: var(--text-secondary); max-width: 460px; line-height: 1.7; }
.empty .hint { font-size: 11px; color: var(--text-muted); }
.primary-btn {
  margin-top: 8px; padding: 9px 20px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 14px rgba(74, 114, 255, 0.28);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(74, 114, 255, 0.34); }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== Hero ===== */
.hero { padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; position: relative; overflow: hidden; }
.hero::before {
  content: ''; position: absolute; inset: -40% 45% 30% -10%;
  background: radial-gradient(circle at 30% 30%, rgba(74,114,255,0.10), transparent 62%);
  pointer-events: none;
}
.hero-main { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.hero-rating { display: flex; flex-direction: column; gap: 4px; }
.cap { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; color: var(--text-muted); }
.rating-flow { display: flex; align-items: baseline; gap: 10px; }
.rating-flow .from { font-size: 30px; font-weight: 800; color: var(--text-muted); letter-spacing: var(--letter-spacing-tight); }
.rating-flow .to { font-size: 42px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.03em; line-height: 1; }
.flow-arrow { color: var(--text-muted); align-self: center; }
.rating-delta { font-size: 15px; font-weight: 700; padding: 3px 9px; border-radius: 8px; }
.rating-delta.up { color: var(--color-success); background: rgba(16,185,129,0.10); }
.rating-delta.down { color: var(--color-danger); background: rgba(239,68,68,0.10); }
.rating-delta.flat { color: var(--text-muted); background: var(--bg-hover); }
.period { font-size: 11px; color: var(--text-muted); }

.verdict { text-align: right; display: flex; flex-direction: column; gap: 4px; max-width: 300px; }
.verdict-label {
  align-self: flex-end; font-size: 13px; font-weight: 700;
  padding: 5px 12px; border-radius: 999px;
}
.verdict-desc { font-size: 11px; color: var(--text-muted); line-height: 1.6; }
.v-strength .verdict-label { color: var(--color-primary); background: rgba(74,114,255,0.10); }
.v-weakness .verdict-label { color: var(--color-success); background: rgba(16,185,129,0.10); }
.v-mixed .verdict-label { color: #8B5CF6; background: rgba(139,92,246,0.10); }
.v-unknown .verdict-label { color: var(--text-secondary); background: var(--bg-hover); }

.hero-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.hero-stat {
  padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.9); display: flex; flex-direction: column; gap: 3px;
}
.hs-label { font-size: 10px; color: var(--text-muted); letter-spacing: 0.04em; }
.hs-value { font-size: 15px; font-weight: 700; color: var(--text-primary); display: flex; align-items: baseline; gap: 6px; }
.hs-from { font-size: 10px; font-weight: 500; color: var(--text-muted); font-style: normal; }
.hs-delta { font-size: 11px; font-weight: 600; }
.up { color: var(--color-success); }
.down { color: var(--color-danger); }
.flat { color: var(--text-muted); }

/* ===== 通用区块头 ===== */
.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.sec-head h3 { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.sec-hint { font-size: 10.5px; color: var(--text-muted); }

/* ===== 结论 ===== */
.narrative { padding: 18px 20px; }
.narrative-list { display: flex; flex-direction: column; gap: 7px; }
.narrative-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary); }
.narrative-list .dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: var(--text-muted); }
.narrative-list li.up .dot { background: var(--color-success); }
.narrative-list li.down .dot { background: var(--color-danger); }
.narrative-list li.up { color: var(--text-primary); }

/* ===== 两列 ===== */
.two-col { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; }
.two-col > section { padding: 18px 20px; }
.no-ability { font-size: 12px; color: var(--text-secondary); line-height: 1.7; display: flex; flex-direction: column; gap: 6px; }
.no-ability .hint { font-size: 11px; color: var(--text-muted); }

.dim-list { display: flex; flex-direction: column; gap: 11px; }
.dim-item { display: grid; grid-template-columns: 62px minmax(0, 1fr) 64px 38px; align-items: center; gap: 10px; }
.dim-name { font-size: 12px; color: var(--text-secondary); }
.dim-track { position: relative; height: 7px; border-radius: 999px; background: rgba(74,114,255,0.08); }
.dim-fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); transition: width 0.5s cubic-bezier(0.22,1,0.36,1); }
.dim-mark { position: absolute; top: -3px; width: 2px; height: 13px; border-radius: 2px; background: rgba(75,85,99,0.55); }
.dim-pair { font-size: 11px; color: var(--text-muted); text-align: right; white-space: nowrap; }
.dim-pair b { color: var(--text-secondary); margin: 0 3px; font-weight: 500; }
.dim-delta { font-size: 12px; font-weight: 700; text-align: right; }

/* ===== 换血 ===== */
.turnover { padding: 18px 20px; }
.turn-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.turn-col { min-width: 0; }
.turn-title { font-size: 11px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.04em; display: flex; align-items: center; gap: 6px; }
.turn-title span { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: var(--bg-hover); color: var(--text-secondary); }
.turn-title.up { color: var(--color-success); }
.turn-title.down { color: var(--color-danger); }
.turn-title.flat { color: var(--text-secondary); }
.turn-empty { font-size: 11.5px; color: var(--text-muted); padding: 6px 0 2px; }
.turn-more { font-size: 10.5px; color: var(--text-muted); margin-top: 6px; }

.chart-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 10px;
  transition: background var(--transition-fast);
}
.chart-row:hover { background: rgba(255,255,255,0.7); }
.chart-row.muted { opacity: 0.72; }
.row-cover { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; flex-shrink: 0; background: var(--bg-body); }
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.row-title { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.diff-pill { font-style: normal; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 4px; letter-spacing: 0.03em; }
.d-master { color: #7C3AED; background: rgba(139,92,246,0.12); }
.d-remaster { color: #DB2777; background: rgba(236,72,153,0.12); }
.d-expert { color: #DC2626; background: rgba(239,68,68,0.12); }
.d-advanced { color: #B45309; background: rgba(245,158,11,0.14); }
.d-basic { color: #047857; background: rgba(16,185,129,0.12); }
.row-const { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.mini-tag { font-size: 9px; color: var(--text-muted); padding: 1px 5px; border-radius: 4px; background: rgba(74,114,255,0.06); }
.row-ach { font-size: 11.5px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.improved { margin-top: 16px; padding-top: 14px; border-top: 1px dashed rgba(74,114,255,0.14); }
.improve-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.improve-chip { font-size: 10.5px; color: var(--text-secondary); background: rgba(255,255,255,0.7); border: 1px solid rgba(74,114,255,0.10); border-radius: 999px; padding: 3px 9px; }
.improve-chip b { margin-left: 5px; font-size: 10px; }

/* ===== 时间线 ===== */
.timeline { padding: 18px 20px; }
.tl-scroll { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; }
.tl-row {
  display: grid; grid-template-columns: 12px 128px 76px 54px 58px minmax(60px, 1fr) 24px;
  align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 9px; cursor: pointer;
  transition: background var(--transition-fast);
}
.tl-row:hover { background: rgba(255,255,255,0.7); }
.tl-row.active { background: rgba(74,114,255,0.07); }
.tl-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(74,114,255,0.35); justify-self: center; }
.tl-row.active .tl-dot { background: var(--color-primary); box-shadow: 0 0 0 3px rgba(74,114,255,0.16); }
.tl-time { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.tl-rating { font-size: 11px; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.tl-delta { font-size: 10.5px; font-weight: 600; }
.tl-ability { font-size: 9.5px; color: var(--text-muted); }
.tl-ability.on { color: var(--color-success); }
.tl-src { font-size: 9.5px; color: var(--text-muted); text-align: right; }
.tl-del {
  width: 20px; height: 20px; border: none; border-radius: 6px; background: transparent;
  color: var(--text-muted); cursor: pointer; font-size: 14px; line-height: 1;
  transition: all var(--transition-fast);
}
.tl-del:hover { color: var(--color-danger); background: rgba(239,68,68,0.08); }

/* ===== 响应式 ===== */
@media (max-width: 1100px) {
  .two-col { grid-template-columns: minmax(0, 1fr); }
  .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .turn-grid { grid-template-columns: minmax(0, 1fr); }
  .tl-row { grid-template-columns: 12px 118px 68px 48px 24px; }
  .tl-ability, .tl-src { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dim-fill { transition: none; }
}
</style>
