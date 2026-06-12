<template>
  <aside class="left-sidebar">
    <div class="sidebar-header">Navigator</div>
    <div class="section">
      <div class="section-title">Player Info</div>
      <div v-if="playerStore.profile" class="player-info">
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">{{ playerStore.playerName }}</span></div>
        <div class="info-row"><span class="info-label">Rating</span><span class="info-value rating-val">{{ playerStore.currentRating }}</span></div>
        <div class="info-row"><span class="info-label">Star</span><span class="info-value">{{ starText }}</span></div>
        <div class="info-row" v-if="playerStore.profile.plate"><span class="info-label">Plate</span><span class="info-value">{{ playerStore.profile.plate }}</span></div>
        <div class="info-row"><span class="info-label">Class</span><span class="info-value">{{ playerStore.profile.classRank || '-' }}</span></div>
        <div class="info-row"><span class="info-label">Course</span><span class="info-value">{{ playerStore.profile.courseRank || '-' }}</span></div>
        <div class="info-row" v-if="playerStore.profile.trophy?.title"><span class="info-label">Trophy</span><span class="info-value" :style="{color:playerStore.profile.trophy.color||'#fff'}">{{ playerStore.profile.trophy.title }}</span></div>
      </div>
      <div v-else class="text-xs text-text-muted px-3 py-1">未同步数据</div>
    </div>
    <div class="section">
      <div class="section-title">Charts &amp; Statistics</div>
      <div class="px-3 py-1">
        <div class="stat-link" @click="$emit('tab','b50')">Best 50</div>
        <div class="stat-link" @click="$emit('tab','song')">Song Analysis</div>
        <div class="stat-link" @click="$emit('tab','weekly')">Weekly Report</div>
        <div class="stat-link" @click="$emit('tab','ai')">AI Coach</div>
      </div>
      <div class="flex gap-3 px-3 py-1">
        <div class="mini-stat"><span class="ms-label">Songs</span><span class="ms-val">{{ songCount }}</span></div>
        <div class="mini-stat"><span class="ms-label">Plays</span><span class="ms-val">{{ playCount }}</span></div>
      </div>
    </div>
    <div class="section flex-1">
      <div class="section-title">Recent Sync</div>
      <div class="px-3 py-1">
        <div v-for="l in recentLogs" :key="l.id" class="log-row" :class="l.status">
          <span class="log-date">{{ fmtDate(l.startedAt) }}</span>
          <span class="log-type">{{ l.syncType==='full'?'Full':'Incr' }}</span>
          <span class="log-num">+{{ l.newRecords }}</span>
        </div>
        <div v-if="recentLogs.length===0" class="text-xs text-text-muted">无记录</div>
      </div>
    </div>
    <div class="p-2 border-t border-bg-hover">
      <input v-model="sq" class="search-input" placeholder="Search songs..." @input="onSearch" />
      <div v-if="results.length>0" class="search-drop">
        <div v-for="s in results" :key="s.songId" class="sr-item" @click="goSong(s.songId)">{{ s.title }}</div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSongStore } from '@/stores/useSongStore';
import { db } from '@/services/db';
import type { SyncLog } from '@/types/sync';

defineEmits<{ tab: [key: string] }>();
const router = useRouter();
const playerStore = usePlayerStore();
const songStore = useSongStore();
const songCount = ref(0);
const playCount = ref(0);
const recentLogs = ref<SyncLog[]>([]);
const sq = ref('');
const results = ref<{ songId: number; title: string }[]>([]);
let timer: number;

const starText = computed(() => {
  const r = playerStore.currentRating;
  if (r >= 15000) return '\u2605\u2605\u2605\u2605\u2605\u2605';
  if (r >= 14500) return '\u2605\u2605\u2605\u2605\u2605';
  if (r >= 14000) return '\u2605\u2605\u2605\u2605';
  if (r >= 13000) return '\u2605\u2605\u2605';
  if (r >= 12000) return '\u2605\u2605';
  if (r >= 10000) return '\u2605';
  return '-';
});

onMounted(async () => {
  songCount.value = await db.songs.count();
  playCount.value = await db.playLogs.count();
  recentLogs.value = await db.syncLogs.orderBy('startedAt').reverse().limit(5).toArray();
});

function fmtDate(d: string) { try { return new Date(d).toLocaleDateString('zh-CN'); } catch { return d; } }

function onSearch() {
  clearTimeout(timer);
  if (!sq.value.trim()) { results.value = []; return; }
  timer = window.setTimeout(async () => {
    const r = await songStore.search(sq.value.trim());
    results.value = r.slice(0, 8).map(s => ({ songId: s.songId, title: s.title }));
  }, 200);
}

function goSong(id: number) { sq.value = ''; results.value = []; router.push(`/song/${id}`); }
</script>

<style scoped>
.left-sidebar { width: 220px; height: 100%; background: var(--bg-secondary); border-right: 1px solid var(--bg-hover); overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column; }
.sidebar-header { padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 1px; border-bottom: 1px solid var(--bg-hover); }
.section { padding: 6px 0; border-bottom: 1px solid var(--bg-hover); }
.section-title { padding: 2px 12px; font-size: 10px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px; }
.player-info { padding: 2px 12px; }
.info-row { display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px; }
.info-label { color: var(--text-muted); }
.info-value { color: var(--text-primary); }
.rating-val { color: var(--color-accent); font-weight: 700; }
.stat-link { display: block; padding: 2px 0; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
.stat-link:hover { color: var(--color-primary); }
.mini-stat { display: flex; flex-direction: column; }
.ms-label { font-size: 10px; color: var(--text-muted); }
.ms-val { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.log-row { display: flex; gap: 6px; padding: 1px 0; font-size: 10px; }
.log-date { flex: 1; color: var(--text-muted); }
.log-num { color: var(--color-success); font-weight: 500; }
.search-input { width: 100%; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--bg-hover); background: var(--bg-primary); color: var(--text-primary); font-size: 12px; outline: none; }
.search-input:focus { border-color: var(--color-primary); }
.search-drop { background: var(--bg-primary); border: 1px solid var(--bg-hover); border-radius: 4px; margin-top: 2px; max-height: 140px; overflow-y: auto; }
.sr-item { padding: 5px 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
.sr-item:hover { background: var(--bg-hover); color: var(--text-primary); }
</style>
