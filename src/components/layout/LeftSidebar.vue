<template>
  <aside class="left-sidebar">
    <div class="p-2">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索曲目..."
        @input="handleSearch"
      />
    </div>

    <div v-if="searchResults.length > 0" class="search-results">
      <div
        v-for="s in searchResults"
        :key="s.songId"
        class="search-item"
        @click="goToSong(s.songId)"
      >
        <span class="text-sm text-text-primary truncate">{{ s.title }}</span>
        <span class="text-xs text-text-muted">{{ s.artist }}</span>
      </div>
    </div>

    <nav class="flex flex-col gap-1 p-2">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: $route.path === item.path }"
      >
        <span class="text-sm">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSongStore } from '@/stores/useSongStore';

const router = useRouter();
const songStore = useSongStore();
const searchQuery = ref('');
const searchResults = ref<{ songId: number; title: string; artist: string }[]>([]);

const navItems = [
  { path: '/', label: '看板' },
  { path: '/weekly', label: '周报' },
  { path: '/sync-log', label: '同步日志' },
  { path: '/practice-plan', label: '练习计划' },
  { path: '/settings', label: '设置' },
];

let debounceTimer: number | undefined;

function handleSearch() {
  clearTimeout(debounceTimer);
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = [];
    return;
  }
  debounceTimer = window.setTimeout(async () => {
    const results = await songStore.search(q);
    searchResults.value = results.map(s => ({
      songId: s.songId,
      title: s.title,
      artist: s.artist,
    }));
  }, 200);
}

function goToSong(songId: number) {
  searchQuery.value = '';
  searchResults.value = [];
  router.push(`/song/${songId}`);
}
</script>

<style scoped>
.left-sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--bg-hover);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--bg-hover);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--color-primary);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-results {
  border-bottom: 1px solid var(--bg-hover);
  max-height: 240px;
  overflow-y: auto;
}

.search-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.search-item:hover {
  background-color: var(--bg-hover);
}

.nav-item {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}

.nav-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: var(--color-primary);
  color: white;
}
</style>
