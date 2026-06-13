<template>
  <div class="song-library p-5 flex flex-col gap-5 h-full overflow-y-auto">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-extrabold tracking-tight text-text-primary">歌曲库</h1>
        <p class="text-xs text-text-muted mt-0.5">
          {{ filteredSongs.length }} / {{ allSongs.length }} 首曲目
        </p>
      </div>
    </div>

    <!-- 搜索 + 过滤栏 -->
    <div class="filter-bar">
      <!-- 搜索框 -->
      <div class="search-box-lib">
        <svg class="search-icon-lib" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          class="search-input-lib"
          placeholder="搜索曲名或艺术家..."
          @input="onSearchDebounced"
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- 类型过滤 -->
      <div class="filter-chips">
        <button
          class="filter-chip"
          :class="{ active: filterType === 'all' }"
          @click="filterType = 'all'"
        >全部</button>
        <button
          class="filter-chip dx-chip"
          :class="{ active: filterType === 'DX' }"
          @click="filterType = 'DX'"
        >
          <span class="chip-badge dx-badge">DX</span> DX 新曲
        </button>
        <button
          class="filter-chip sd-chip"
          :class="{ active: filterType === 'SD' }"
          @click="filterType = 'SD'"
        >
          <span class="chip-badge sd-badge">SD</span> 标准曲
        </button>
      </div>

      <!-- 排序 -->
      <div class="sort-row">
        <span class="sort-label">排序</span>
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="sort-btn"
          :class="{ active: sortBy === opt.key }"
          @click="sortBy = opt.key"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- 歌曲网格 -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="loading-spinner" />
      <span class="ml-3 text-sm text-text-muted">加载曲库...</span>
    </div>

    <div v-else-if="filteredSongs.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      <p class="empty-title">未找到匹配曲目</p>
      <p class="empty-desc">尝试调整搜索词或过滤条件</p>
    </div>

    <div v-else class="song-grid">
      <div
        v-for="(song, idx) in pagedSongs"
        :key="song.songId"
        class="song-card"
        :style="{ animationDelay: `${idx * 30}ms` }"
        @click="$emit('select-song', song.songId)"
      >
        <!-- 封面 -->
        <div class="song-cover-wrap">
          <img
            :src="getCoverUrl(song.songId)"
            :alt="song.title"
            class="song-cover-img"
            loading="lazy"
            @error="onCoverError"
          />
          <div class="cover-overlay">
            <span class="cover-play-icon">▶</span>
          </div>
          <!-- 类型角标 -->
          <span class="song-type-badge" :class="song.type === 'DX' ? 'badge-dx' : 'badge-sd'">
            {{ song.type }}
          </span>
        </div>

        <!-- 信息区 -->
        <div class="song-info">
          <h3 class="song-title" :title="song.title">{{ song.title }}</h3>
          <p class="song-artist" :title="song.artist">{{ song.artist }}</p>

          <!-- 难度定数条 -->
          <div class="diff-pills">
            <span
              v-for="diff in availableDiffs(song)"
              :key="diff.key"
              class="diff-pill"
              :class="'pill-' + diff.key"
              :title="`${diff.label} ${diff.level ?? '?'} (定数 ${diff.constant})`"
            >
              <span class="pill-label">{{ diff.short }}</span>
              <span class="pill-const">{{ diff.constant?.toFixed(1) ?? '-' }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="load-more-wrap">
      <button class="load-more-btn" @click="loadMore">
        加载更多 ({{ filteredSongs.length - pagedSongs.length }} 首剩余)
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useSongStore } from '@/stores/useSongStore';
import type { SongMeta, DifficultyType } from '@/types/song';
import { DIFFICULTY_LIST, DIFFICULTY_LABEL, DIFFICULTY_LABEL_SHORT } from '@/types/song';
import { getCoverUrl } from '@/types/sync';

defineEmits<{ 'select-song': [songId: number] }>();

const songStore = useSongStore();
const allSongs = ref<SongMeta[]>([]);
const isLoading = ref(true);
const searchQuery = ref('');
const filterType = ref<'all' | 'DX' | 'SD'>('all');
const sortBy = ref<'title' | 'constant' | 'bpm' | 'newest'>('constant');
const pageSize = 30;
const displayCount = ref(pageSize);

const sortOptions = [
  { key: 'constant', label: '定数' },
  { key: 'title', label: '曲名' },
  { key: 'bpm', label: 'BPM' },
  { key: 'newest', label: '最新' },
];

// 过滤
const filteredSongs = computed(() => {
  let list = allSongs.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(s =>
      s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }

  if (filterType.value !== 'all') {
    list = list.filter(s => s.type === filterType.value);
  }

  // 排序
  switch (sortBy.value) {
    case 'title':
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh'));
      break;
    case 'constant':
      list = [...list].sort((a, b) => (getMaxConst(b) ?? 0) - (getMaxConst(a) ?? 0));
      break;
    case 'bpm':
      list = [...list].sort((a, b) => (b.bpm ?? 0) - (a.bpm ?? 0));
      break;
    case 'newest':
      // isNew 优先
      list = [...list].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      break;
  }

  return list;
});

const pagedSongs = computed(() => filteredSongs.value.slice(0, displayCount.value));
const hasMore = computed(() => displayCount.value < filteredSongs.value.length);

function loadMore() {
  displayCount.value = Math.min(displayCount.value + pageSize, filteredSongs.value.length);
}

// 搜索防抖
let debounceTimer: number;
function onSearchDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    displayCount.value = pageSize;
  }, 300);
}

function clearSearch() {
  searchQuery.value = '';
  displayCount.value = pageSize;
}

// 重置分页当过滤条件改变
watch([filterType, sortBy], () => { displayCount.value = pageSize; });

function getMaxConst(song: SongMeta): number | null {
  const vals = [song.basicConst, song.advancedConst, song.expertConst, song.masterConst, song.remasterConst]
    .filter((v): v is number => v != null && v > 0);
  return vals.length > 0 ? Math.max(...vals) : null;
}

function availableDiffs(song: SongMeta) {
  const map: Record<DifficultyType, number | null> = {
    basic: song.basicConst, advanced: song.advancedConst,
    expert: song.expertConst, master: song.masterConst, remaster: song.remasterConst,
  };
  const levelMap: Record<DifficultyType, string | null> = {
    basic: song.basicLevel, advanced: song.advancedLevel,
    expert: song.expertLevel, master: song.masterLevel, remaster: song.remasterLevel,
  };
  return DIFFICULTY_LIST
    .filter(d => map[d] != null)
    .map(d => ({
      key: d,
      label: DIFFICULTY_LABEL[d],
      short: DIFFICULTY_LABEL_SHORT[d],
      constant: map[d],
      level: levelMap[d],
    }));
}

function onCoverError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

onMounted(async () => {
  if (songStore.songs.size === 0) {
    await songStore.loadFromDB();
  }
  allSongs.value = Array.from(songStore.songs.values());
  isLoading.value = false;
});
</script>

<style scoped>
.song-library {
  background: transparent;
}

/* ===== 过滤栏 ===== */
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  border-top: 1px solid rgba(255,255,255,0.9);
  border-left: 1px solid rgba(255,255,255,0.8);
  box-shadow: var(--shadow-card);
  padding: 18px 20px;
}

/* 搜索框 */
.search-box-lib {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  background: var(--bg-body);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}
.search-box-lib:focus-within {
  border-color: rgba(74,114,255,0.3);
  box-shadow: 0 0 0 3px rgba(74,114,255,0.06);
  background: white;
}
.search-icon-lib { color: var(--text-muted); flex-shrink: 0; }
.search-input-lib {
  flex: 1; border: none; outline: none;
  font-size: 13px; color: var(--text-primary);
  background: transparent;
}
.search-input-lib::placeholder { color: var(--text-muted); }
.search-clear {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 2px;
  display: flex; align-items: center;
  transition: color 0.2s;
}
.search-clear:hover { color: var(--text-primary); }

/* 过滤 Chips */
.filter-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.filter-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px; border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--bg-body);
  font-size: 12px; font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-smooth);
}
.filter-chip:hover { background: white; border-color: rgba(74,114,255,0.2); }
.filter-chip.active {
  background: white;
  border-color: var(--color-primary);
  color: var(--color-primary);
  box-shadow: 0 2px 12px rgba(74,114,255,0.1);
}

.chip-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 18px; border-radius: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.02em;
}
.dx-badge { background: linear-gradient(135deg, #4A72FF, #9D7BFF); color: white; }
.sd-badge { background: #E5E7EB; color: #6B7280; }

/* 排序 */
.sort-row { display: flex; align-items: center; gap: 8px; }
.sort-label { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }
.sort-btn {
  padding: 5px 14px; border-radius: 9999px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 12px; font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.sort-btn:hover { color: var(--text-secondary); background: var(--bg-body); }
.sort-btn.active {
  background: rgba(74,114,255,0.08);
  color: var(--color-primary);
  border-color: rgba(74,114,255,0.15);
}

/* ===== 歌曲网格 ===== */
.song-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}

/* ===== 歌曲卡片 ===== */
.song-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255,255,255,0.7);
  border-top: 1px solid rgba(255,255,255,0.9);
  box-shadow:
    0 4px 16px rgba(44, 76, 160, 0.03),
    0 1px 0 rgba(255,255,255,0.6) inset;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: card-rise 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes card-rise {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.song-card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow:
    0 16px 48px rgba(44, 76, 160, 0.08),
    0 2px 0 rgba(255,255,255,0.8) inset;
  border-color: rgba(255,255,255,0.95);
  background: rgba(255, 255, 255, 0.88);
}

.song-card:active { transform: scale(0.98); }

/* 封面 */
.song-cover-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: linear-gradient(135deg, #E8ECFF 0%, #F0E8FF 100%);
}

.song-cover-img {
  width: 100%; height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.song-card:hover .song-cover-img { transform: scale(1.08); }

.cover-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.song-card:hover .cover-overlay { opacity: 1; }

.cover-play-icon {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

/* 类型角标 */
.song-type-badge {
  position: absolute; top: 10px; right: 10px;
  padding: 3px 10px; border-radius: 9999px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.03em;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.badge-dx {
  background: rgba(74,114,255,0.85); color: white;
  box-shadow: 0 2px 10px rgba(74,114,255,0.3);
}
.badge-sd {
  background: rgba(107,114,128,0.75); color: white;
  box-shadow: 0 2px 10px rgba(107,114,128,0.2);
}

/* 信息区 */
.song-info {
  padding: 14px 16px 16px;
  display: flex; flex-direction: column; gap: 8px;
}

.song-title {
  font-size: 14px; font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.song-artist {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: -4px;
}

/* 难度定数条 */
.diff-pills {
  display: flex; gap: 5px; flex-wrap: wrap;
}
.diff-pill {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.01em;
  transition: transform 0.2s ease;
}
.diff-pill:hover { transform: scale(1.08); }

.pill-label { opacity: 0.75; }
.pill-const { opacity: 0.9; }

.pill-basic     { background: rgba(16,185,129,0.1); color: #059669; }
.pill-advanced  { background: rgba(245,158,11,0.1); color: #D97706; }
.pill-expert    { background: rgba(239,68,68,0.1); color: #DC2626; }
.pill-master    { background: rgba(139,92,246,0.1); color: #7C3AED; }
.pill-remaster  { background: rgba(236,72,153,0.1); color: #DB2777; }

/* ===== 加载 ===== */
.loading-spinner {
  width: 28px; height: 28px;
  border: 3px solid rgba(74,114,255,0.1);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== 空状态 ===== */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; gap: 12px;
}
.empty-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: rgba(139,155,180,0.08);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
}
.empty-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.empty-desc { font-size: 13px; color: var(--text-muted); }

/* ===== 加载更多 ===== */
.load-more-wrap { display: flex; justify-content: center; padding: 12px 0 24px; }
.load-more-btn {
  padding: 10px 28px; border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 13px; font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-smooth);
}
.load-more-btn:hover {
  background: white;
  border-color: rgba(74,114,255,0.2);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}
</style>
