<template>
  <div class="song-detail p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <template v-if="!isNaN(songId) && songId > 0">
      <!-- 返回按钮 + 标题 -->
      <div class="flex items-center gap-3 mb-1">
        <button class="back-btn" @click="$emit('back')" title="返回歌曲库">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div>
          <h1 class="text-lg font-bold">{{ song?.title ?? '未知曲目' }}</h1>
          <p v-if="song" class="text-xs text-text-muted mt-0.5">{{ song.artist }} · {{ song.type }} · BPM {{ song.bpm ?? '?' }}</p>
        </div>
      </div>

      <!-- 难度选择 -->
      <div class="flex gap-1 flex-wrap">
        <button
          v-for="diff in availableDiffs"
          :key="diff"
          class="diff-btn"
          :class="{
            active: selectedDiff === diff,
            played: playedDiffs.includes(diff),
          }"
          @click="selectDifficulty(diff)"
        >
          {{ diffLabel(diff) }}
          <span v-if="playedDiffs.includes(diff)" class="played-dot" />
        </button>
      </div>

      <section class="chart-card">
        <h2 class="card-title">受苦进化史</h2>
        <div class="h-[220px]">
          <SongHistoryChart :records="historyRecords" />
        </div>
      </section>

      <!-- 判定补充 + 趋势 -->
      <section class="chart-card">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title mb-0">判定偏差趋势</h2>
          <button class="toggle-judge-btn" @click="showJudgeForm = !showJudgeForm">
            {{ showJudgeForm ? '收起' : '✏️ 补充判定数据' }}
          </button>
        </div>

        <!-- 判定表单 -->
        <div v-if="showJudgeForm" class="judge-form">
          <p class="judge-form-hint">从官方舞萌 DX 小程序对照填入判定明细（非必填，填你有数据的 note 即可）</p>
          <div class="judge-grid">
            <div v-for="nt in (['tap','hold','slide','touch','break'] as NoteType[])" :key="nt" class="judge-note-block">
              <span class="judge-note-label">{{ NOTE_TYPE_LABEL[nt] }}</span>
              <div class="judge-fields">
                <label class="jf"><span>P</span><input v-model.number="judgeForm[nt].perfect" type="number" min="0" class="jf-input" /></label>
                <label class="jf"><span>Gr</span><input v-model.number="judgeForm[nt].great" type="number" min="0" class="jf-input" /></label>
                <label class="jf"><span>Gd</span><input v-model.number="judgeForm[nt].good" type="number" min="0" class="jf-input" /></label>
                <label class="jf"><span>M</span><input v-model.number="judgeForm[nt].miss" type="number" min="0" class="jf-input" /></label>
              </div>
            </div>
          </div>
          <div class="judge-global">
            <label class="jf"><span>Fast</span><input v-model.number="judgeForm.fast" type="number" min="0" class="jf-input" /></label>
            <label class="jf"><span>Late</span><input v-model.number="judgeForm.late" type="number" min="0" class="jf-input" /></label>
          </div>
          <button class="save-judge-btn" @click="handleSaveJudge">💾 保存判定数据</button>
          <p v-if="judgeSavedMsg" class="judge-saved-msg">{{ judgeSavedMsg }}</p>

          <!-- 判定摘要 -->
          <div v-if="judgeSummary" class="judge-summary mt-3">
            <div class="judge-summary-title">📊 判定概览（总 Notes: {{ judgeSummary.totalNotes }} | Fast: {{ judgeSummary.fast }} | Late: {{ judgeSummary.late }}）</div>
            <div class="judge-summary-bars">
              <div v-for="n in judgeSummary.notes" :key="n.type" class="jsb-row">
                <span class="jsb-label">{{ n.label }}</span>
                <div class="jsb-bar-wrap">
                  <div class="jsb-bar jsb-p" :style="{ width: (n.perfect / Math.max(n.total,1) * 100) + '%' }" />
                  <div class="jsb-bar jsb-gr" :style="{ width: (n.great / Math.max(n.total,1) * 100) + '%' }" />
                  <div class="jsb-bar jsb-gd" :style="{ width: (n.good / Math.max(n.total,1) * 100) + '%' }" />
                  <div class="jsb-bar jsb-m" :style="{ width: (n.miss / Math.max(n.total,1) * 100) + '%' }" />
                </div>
                <span class="jsb-acc">{{ n.acc }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 散点图（有判定数据时显示） -->
        <div v-else class="h-[200px]">
          <JudgeScatterChart :records="historyRecords" />
        </div>
      </section>

      <!-- 成绩摘要 -->
      <section class="chart-card">
        <h2 class="card-title">成绩摘要</h2>
        <div class="score-summary-grid">
          <div class="ss-item">
            <span class="ss-label">最佳达成率</span>
            <span class="ss-val grad-text">{{ bestAchievement }}%</span>
          </div>
          <div class="ss-item">
            <span class="ss-label">最高 DX 分数</span>
            <span class="ss-val">{{ bestDxScore }}</span>
          </div>
          <div class="ss-item">
            <span class="ss-label">最高 DX Rating</span>
            <span class="ss-val">{{ bestDxRating }}</span>
          </div>
          <div class="ss-item">
            <span class="ss-label">游玩次数</span>
            <span class="ss-val">{{ historyRecords.length }}</span>
          </div>
          <div class="ss-item">
            <span class="ss-label">最新评级</span>
            <span class="ss-val rate-badge">{{ latestRate || '-' }}</span>
          </div>
          <div class="ss-item">
            <span class="ss-label">最新连击</span>
            <span class="ss-val">{{ latestFc }}</span>
          </div>
        </div>
      </section>
    </template>
    <div v-else class="flex items-center justify-center h-full text-text-muted text-sm">
      请从歌曲库中选择一首曲目查看详情
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { db } from '@/services/db';
import SongHistoryChart from '@/components/charts/SongHistoryChart.vue';
import JudgeScatterChart from '@/components/charts/JudgeScatterChart.vue';
import { DIFFICULTY_LIST, type DifficultyType, type NoteType, NOTE_TYPE_LABEL, type JudgeDetail, emptyJudgeDetail, calcJudgeSummary } from '@/types/song';
import { getOrCreateJudgeDetail, saveJudgeDetail } from '@/services/judgeStorage';

const props = defineProps<{ songId?: number | null }>();
defineEmits<{ back: [] }>();

const route = useRoute();
const songStore = useSongStore();
const playLogStore = usePlayLogStore();

const songId = computed(() => props.songId ?? Number(route.params.songId));
const song = computed(() => songStore.getSong(songId.value));
const selectedDiff = ref<DifficultyType>('master');
const historyRecords = ref<any[]>([]);
/** 用户实际打过的难度列表（用于智能默认选择） */
const playedDiffs = ref<DifficultyType[]>([]);

// ---- 判定补充表单 ----
const showJudgeForm = ref(false);
const judgeForm = ref<JudgeDetail>(emptyJudgeDetail());
const judgeSavedMsg = ref('');

const judgeSummary = computed(() => {
  const jd = judgeForm.value;
  const hasData = (['tap', 'hold', 'slide', 'touch', 'break'] as NoteType[]).some(
    t => jd[t].perfect > 0 || jd[t].great > 0 || jd[t].good > 0 || jd[t].miss > 0
  );
  return hasData ? calcJudgeSummary(jd) : null;
});

async function loadJudgeData() {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  judgeForm.value = await getOrCreateJudgeDetail(sid, selectedDiff.value);
  judgeSavedMsg.value = '';
}

async function handleSaveJudge() {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  await saveJudgeDetail(sid, selectedDiff.value, judgeForm.value);
  judgeSavedMsg.value = '已保存 ✓';
  setTimeout(() => { judgeSavedMsg.value = ''; }, 2000);
}

// ---- 成绩摘要计算 ----
const bestAchievement = computed(() => {
  if (historyRecords.value.length === 0) return '-';
  return Math.max(...historyRecords.value.map(r => r.achievements)).toFixed(4);
});
const bestDxScore = computed(() => {
  if (historyRecords.value.length === 0) return '-';
  const scores = historyRecords.value.map(r => r.dxScore);
  return scores.length > 0 ? Math.max(...scores) : '-';
});
const bestDxRating = computed(() => {
  if (historyRecords.value.length === 0) return '-';
  const valid = historyRecords.value.filter(r => r.dxRating != null);
  return valid.length > 0 ? Math.max(...valid.map(r => r.dxRating!)) : '-';
});
const latestRate = computed(() => {
  if (historyRecords.value.length === 0) return null;
  return historyRecords.value[historyRecords.value.length - 1].rate || null;
});
const latestFc = computed(() => {
  if (historyRecords.value.length === 0) return '-';
  const fc = historyRecords.value[historyRecords.value.length - 1].fcStatus;
  const map: Record<string, string> = { ap: 'AP', fcp: 'FC+', fc: 'FC' };
  return (map[fc] ?? fc) || '-';
});

const availableDiffs = computed(() => {
  const s = song.value;
  if (!s) return [];
  return DIFFICULTY_LIST.filter(d => {
    const map: Record<string, number | null> = {
      basic: s.basicConst, advanced: s.advancedConst, expert: s.expertConst,
      master: s.masterConst, remaster: s.remasterConst,
    };
    return map[d] != null;
  });
});

/**
 * 智能加载：先探测用户打过哪些难度，优先选有记录的；
 * 如果都没打过，回退到第一个有定数的难度（至少能看到曲目信息）
 */
async function autoLoadSongData() {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;

  // 1) 探测已打过的难度
  const allRecords = await db.playLogs
    .where('songId')
    .equals(sid)
    .toArray();
  const diffSet = new Set(allRecords.map(r => r.difficulty as DifficultyType));
  playedDiffs.value = DIFFICULTY_LIST.filter(d => diffSet.has(d));

  // 2) 选默认难度：优先有记录的 → 否则第一个可用难度
  const avail = availableDiffs.value;
  if (playedDiffs.value.length > 0) {
    // 有记录：优先 master > remaster > expert > advanced > basic
    const priority: DifficultyType[] = ['master', 'remaster', 'expert', 'advanced', 'basic'];
    const best = priority.find(d => playedDiffs.value.includes(d));
    selectedDiff.value = best ?? playedDiffs.value[0];
  } else if (avail.length > 0) {
    // 无记录：选最高难度（通常 master 或 remaster 最有参考价值）
    selectedDiff.value = avail[avail.length - 1];
  }

  // 3) 加载选中难度的数据
  await loadDiffData(selectedDiff.value);
  await loadJudgeData();
}

async function selectDifficulty(d: DifficultyType) {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  selectedDiff.value = d;
  await loadDiffData(d);
  await loadJudgeData();
}

async function loadDiffData(d: DifficultyType) {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  historyRecords.value = await playLogStore.getSongHistory(sid, d);
}

function diffLabel(d: DifficultyType): string {
  const map: Record<string, string> = { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM' };
  return map[d] ?? d.toUpperCase();
}

onMounted(async () => {
  if (songStore.songs.size === 0) {
    await songStore.loadFromDB();
  }
  await autoLoadSongData();
});

// ⚠️ v-if tab 切换时组件不会重新挂载，watch songId 变化来重新加载
watch(songId, async (newId) => {
  if (!isNaN(newId) && newId > 0) {
    await autoLoadSongData();
  }
});
</script>

<style scoped>
/* 返回按钮 */
.back-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-smooth);
}
.back-btn:hover {
  background: white;
  border-color: rgba(74,114,255,0.2);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  transform: translateX(-2px);
}

.chart-card {
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  border-top: 1px solid rgba(255,255,255,0.9);
  box-shadow: var(--shadow-card);
  padding: 20px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.diff-btn {
  position: relative;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  backdrop-filter: blur(8px);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.diff-btn:hover {
  background: white;
  border-color: rgba(74,114,255,0.2);
  color: var(--text-primary);
}

.diff-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  box-shadow: 0 2px 10px rgba(74,114,255,0.25);
}

/* 已游玩过的难度：边框高亮 */
.diff-btn.played {
  border-color: rgba(16,185,129,0.35);
}

.diff-btn.played.active {
  border-color: var(--color-primary);
}

.played-dot {
  position: absolute;
  top: 3px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 6px rgba(16,185,129,0.5);
}

/* ===== 成绩摘要 ===== */
.score-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.ss-item {
  text-align: center;
  padding: 12px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-body);
  transition: background 0.2s ease;
}
.ss-item:hover { background: white; }
.ss-label { display: block; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px; }
.ss-val { display: block; font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
.rate-badge {
  display: inline-block;
  padding: 2px 10px; border-radius: 6px;
  background: rgba(74,114,255,0.1); color: var(--color-primary);
  font-size: 14px;
}

/* ===== 判定表单 ===== */
.toggle-judge-btn {
  padding: 4px 12px; border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-body); font-size: 11px; font-weight: 600;
  color: var(--color-primary); cursor: pointer;
  transition: all var(--transition-fast);
}
.toggle-judge-btn:hover { background: rgba(74,114,255,0.06); border-color: rgba(74,114,255,0.2); }

.judge-form { margin-top: 8px; }
.judge-form-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }

.judge-grid { display: flex; flex-direction: column; gap: 8px; }
.judge-note-block { display: flex; align-items: center; gap: 10px; }
.judge-note-label {
  min-width: 44px; font-size: 11px; font-weight: 700;
  color: var(--text-secondary); text-align: right;
}
.judge-fields { display: flex; gap: 4px; }
.jf { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.jf span { font-size: 9px; color: var(--text-muted); font-weight: 600; }
.jf-input {
  width: 48px; padding: 3px 4px; border-radius: 4px;
  border: 1px solid var(--border-color); background: var(--bg-body);
  font-size: 12px; text-align: center; color: var(--text-primary);
  outline: none; transition: border-color var(--transition-fast);
}
.jf-input:focus { border-color: var(--color-primary); }

.judge-global { display: flex; gap: 12px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); }

.save-judge-btn {
  margin-top: 10px; padding: 7px 20px; border-radius: 8px;
  border: none; background: var(--color-primary); color: white;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all var(--transition-fast);
}
.save-judge-btn:hover { background: var(--color-primary-dark); }
.judge-saved-msg { font-size: 11px; color: var(--color-success); margin-top: 4px; }

/* 判定摘要条 */
.judge-summary { background: var(--bg-body); border-radius: var(--radius-sm); padding: 12px; }
.judge-summary-title { font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; }
.judge-summary-bars { display: flex; flex-direction: column; gap: 5px; }
.jsb-row { display: flex; align-items: center; gap: 8px; }
.jsb-label { font-size: 10px; font-weight: 600; color: var(--text-muted); min-width: 36px; }
.jsb-bar-wrap {
  flex: 1; height: 10px; border-radius: 5px; overflow: hidden;
  background: rgba(139,155,180,0.1); display: flex;
}
.jsb-bar { height: 100%; transition: width 0.3s ease; }
.jsb-p  { background: #10B981; }
.jsb-gr { background: #F59E0B; }
.jsb-gd { background: #EF4444; }
.jsb-m  { background: #6B7280; }
.jsb-acc { font-size: 10px; font-weight: 700; color: var(--text-primary); min-width: 40px; text-align: right; }
</style>
