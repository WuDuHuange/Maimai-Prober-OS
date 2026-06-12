<template>
  <aside class="left-panel">
    <div class="search-box">
      <span class="search-icon">Q</span>
      <input v-model="sq" class="search-input" placeholder="搜索歌曲..." @input="onSearch" />
    </div>
    <div v-if="results.length > 0" class="search-drops">
      <div v-for="s in results" :key="s.songId" class="sr-item" @click="goSong(s.songId)">{{ s.title }}</div>
    </div>

    <div class="panel-section">
      <div class="section-header">最近同步</div>
      <div class="recent-list">
        <div v-for="r in recentPlays" :key="r.id" class="recent-item">
          <img :src="r.coverUrl" class="song-cover" @error="e => (e.target as HTMLImageElement).style.display='none'" />
          <div class="recent-info">
            <span class="song-name">{{ r.title }}</span>
            <span class="song-artist">{{ r.artist }}</span>
          </div>
          <div class="recent-meta">
            <span class="diff-tag" :class="'diff-'+r.difficulty">{{ diffShort(r.difficulty) }} {{ r.constant?.toFixed(1) }}</span>
            <span class="achievement-num">{{ r.achievements.toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-section sync-card">
      <div class="section-header">
        <span>水鱼增量同步引擎</span>
        <span class="tag sync-mode" v-if="syncStore.status === 'syncing'">同步中</span>
        <span class="tag sync-mode" v-else>已就绪</span>
      </div>
      <div class="sync-progress-area">
        <svg class="circular-progress" viewBox="0 0 100 100">
          <circle class="bg-circle" cx="50" cy="50" r="38" fill="none" stroke="#E8ECF0" stroke-width="8" />
          <circle class="fg-circle" cx="50" cy="50" r="38" fill="none" stroke="url(#grad)" stroke-width="8" stroke-linecap="round" :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset" transform="rotate(-90 50 50)" />
          <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#4A72FF" /><stop offset="100%" stop-color="#A67CFF" /></linearGradient></defs>
        </svg>
        <div class="progress-center"><span class="progress-pct">{{ syncPct }}%</span></div>
      </div>
      <div class="sync-stats">
        <div class="sync-stat"><span class="ss-label">已同步</span><span class="ss-val">{{ syncedCount }}</span></div>
        <div class="sync-stat"><span class="ss-label">曲库</span><span class="ss-val">{{ songCount }}</span></div>
        <div class="sync-stat"><span class="ss-label">上次</span><span class="ss-val">{{ lastSyncLabel }}</span></div>
      </div>
      <button class="sync-trigger-btn" @click="$emit('sync')" :disabled="syncStore.status === 'syncing'">
        {{ syncStore.status === 'syncing' ? '同步中...' : '开始同步' }}
      </button>
    </div>

    <div class="network-status">
      <span class="net-dot" /> 本地数据库就绪 ({{ syncedCount }} 条记录)
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { db } from '@/services/db';
import { getCoverUrl } from '@/types/sync';

defineEmits<{ sync: [] }>();

const syncStore = useSyncStore();
const songStore = useSongStore();
const playLogStore = usePlayLogStore();
const sq = ref('');
const results = ref<{ songId: number; title: string }[]>([]);
const syncedCount = ref(0);
const songCount = ref(0);
const recentPlays = ref<any[]>([]);
const circumference = 238.76;

const lastSyncLabel = computed(() => {
  const t = playLogStore.lastSyncTime;
  if (!t) return '-';
  try { return new Date(t).toLocaleDateString('zh-CN'); } catch { return '-'; }
});

const syncPct = computed(() => {
  if (syncStore.status === 'syncing' && syncStore.progress.total > 0) {
    return Math.round((syncStore.progress.current / syncStore.progress.total) * 100);
  }
  return syncedCount.value > 0 ? 100 : 0;
});

const dashOffset = computed(() => circumference * (1 - syncPct.value / 100));

let timer: number;

async function loadSidebarData() {
  syncedCount.value = await db.playLogs.count();
  songCount.value = await db.songs.count();
  const plays = await db.playLogs.orderBy('playTime').reverse().limit(5).toArray();
  const songIds = [...new Set(plays.map(p => Number(p.songId)))];
  const songs = await db.songs.bulkGet(songIds);
  const songMap = new Map(songs.filter(Boolean).map(s => [s!.songId, s!]));

  recentPlays.value = plays.map(p => {
    const s = songMap.get(Number(p.songId));
    return {
      id: p.id, title: s?.title ?? `#${p.songId}`,
      artist: s?.artist ?? '', difficulty: p.difficulty,
      constant: getConst(s, p.difficulty), achievements: p.achievements,
      coverUrl: getCoverUrl(Number(p.songId)),
    };
  });
}

onMounted(loadSidebarData);

// Reload after sync completes
watch(() => syncStore.status, (s) => {
  if (s === 'completed') loadSidebarData();
});

function getConst(song: any, diff: string): number | null {
  if (!song) return null;
  const m: Record<string, any> = { basic: 'basicConst', advanced: 'advancedConst', expert: 'expertConst', master: 'masterConst', remaster: 'remasterConst' };
  return song[m[diff]] ?? null;
}

function diffShort(d: string) { const m: Record<string, string> = { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM' }; return m[d] || d; }

function onSearch() {
  clearTimeout(timer);
  if (!sq.value.trim()) { results.value = []; return; }
  timer = window.setTimeout(async () => {
    const r = await songStore.search(sq.value.trim());
    results.value = r.slice(0, 8).map(s => ({ songId: s.songId, title: s.title }));
  }, 200);
}

function goSong(_id: number) { sq.value = ''; results.value = []; }
</script>

<style scoped>
.left-panel {
  width: 260px;
  height: 100%;
  background: var(--bg-body);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* ===== Search ===== */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.search-box:focus-within {
  box-shadow: var(--shadow-sm);
  border-color: var(--color-primary-light);
}

.search-icon { color: var(--text-muted); font-size: 14px; }
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  background: transparent;
}
.search-input::placeholder { color: var(--text-muted); }

.search-drops {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  margin-top: -8px;
  max-height: 150px;
  overflow-y: auto;
}
.sr-item { padding: 8px 14px; font-size: 12px; cursor: pointer; transition: background var(--transition-fast); }
.sr-item:hover { background: var(--bg-hover); }

/* ===== Panel Section ===== */
.panel-section {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color-light);
  padding: 16px;
}

.section-header {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
}

.sync-mode {
  background: #ECFDF5;
  color: #10B981;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: var(--letter-spacing-wide);
}

/* ===== Recent Plays ===== */
.recent-list { display: flex; flex-direction: column; gap: 10px; }

.recent-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.recent-item:hover { background: var(--bg-hover); }

.song-cover {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #E8ECFF, #F3E8FF);
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
}

.recent-info { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.song-name { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.song-artist { font-size: 10px; color: var(--text-muted); font-weight: 400; }

.recent-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.diff-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: var(--letter-spacing-wide);
}
.diff-basic { color: #10B981; background: #ECFDF5; }
.diff-advanced { color: #F59E0B; background: #FFFBEB; }
.diff-expert { color: #EF4444; background: #FEF2F2; }
.diff-master { color: #8B5CF6; background: #F5F3FF; }
.diff-remaster { color: #EC4899; background: #FDF2F8; }
.achievement-num { font-size: 12px; font-weight: 700; color: var(--text-primary); letter-spacing: var(--letter-spacing-tight); }

/* ===== Sync Card ===== */
.sync-card { text-align: center; }

.sync-progress-area {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 16px auto;
}

.circular-progress { width: 100%; height: 100%; }

.progress-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.progress-pct { font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: var(--letter-spacing-tight); }

.sync-stats { display: flex; justify-content: space-around; margin-bottom: 12px; }
.sync-stat { display: flex; flex-direction: column; gap: 2px; }
.ss-label { font-size: 10px; color: var(--text-muted); font-weight: 500; letter-spacing: var(--letter-spacing-wide); }
.ss-val { font-size: 13px; font-weight: 700; color: var(--text-primary); }

.sync-trigger-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: white;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-smooth);
  letter-spacing: var(--letter-spacing-wide);
}
.sync-trigger-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--color-primary-light);
}
.sync-trigger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== Network Status ===== */
.network-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.net-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  animation: breathe 2s infinite;
}

@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}
</style>
