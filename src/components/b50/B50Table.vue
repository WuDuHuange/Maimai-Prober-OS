<template>
  <div class="b50-table">
    <div v-if="loading" class="text-text-muted text-sm p-4 text-center">加载中...</div>
    <div v-else-if="list.length === 0" class="text-text-muted text-sm p-4 text-center">
      暂无 B50 数据, 请先同步数据
    </div>
    <table v-else class="w-full">
      <thead>
        <tr class="text-xs text-text-muted border-b border-bg-hover">
          <th class="py-2 px-2 text-left">#</th>
          <th class="py-2 px-2 text-left">曲名</th>
          <th class="py-2 px-2 text-left">难度</th>
          <th class="py-2 px-2 text-right">定数</th>
          <th class="py-2 px-2 text-right">达成率</th>
          <th class="py-2 px-2 text-center">FC</th>
          <th class="py-2 px-2 text-right">贡献</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, idx) in list"
          :key="item.id ?? idx"
          class="song-row"
          @click="goToSong(item.songId)"
        >
          <td class="py-2 px-2 text-xs text-text-muted">{{ idx + 1 }}</td>
          <td class="py-2 px-2 text-sm text-text-primary truncate max-w-[160px]">{{ item.title ?? '未知' }}</td>
          <td class="py-2 px-2 text-xs">
            <span :class="diffClass(item.difficulty)">{{ diffLabel(item.difficulty) }}</span>
          </td>
          <td class="py-2 px-2 text-xs text-text-secondary text-right">{{ item.constant?.toFixed(1) ?? '-' }}</td>
          <td class="py-2 px-2 text-xs text-text-secondary text-right">{{ item.achievements.toFixed(2) }}%</td>
          <td class="py-2 px-2 text-xs text-center">
            <span v-if="item.fcStatus === 'ap'" class="badge badge-ap">AP</span>
            <span v-else-if="item.fcStatus === 'fc'" class="badge badge-fc">FC</span>
            <span v-else class="text-text-muted">-</span>
          </td>
          <td class="py-2 px-2 text-xs text-right" :class="item.ratingContribution >= 14 ? 'text-accent font-bold' : 'text-text-secondary'">
            {{ item.ratingContribution.toFixed(1) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useB50Store } from '@/stores/useB50Store';
import type { DifficultyType } from '@/types/song';

const router = useRouter();
const store = useB50Store();
const list = ref(store.b50List);
const loading = ref(true);

onMounted(async () => {
  await store.loadFromDB();
  list.value = store.b50List;
  loading.value = false;
});

function goToSong(songId: number) {
  router.push(`/song/${songId}`);
}

function diffLabel(d: DifficultyType): string {
  const map: Record<string, string> = {
    basic: 'Bas', advanced: 'Adv', expert: 'Exp', master: 'Mas', remaster: 'ReM',
  };
  return map[d] ?? d;
}

function diffClass(d: DifficultyType): string {
  const map: Record<string, string> = {
    basic: 'diff-basic',
    advanced: 'diff-advanced',
    expert: 'diff-expert',
    master: 'diff-master',
    remaster: 'diff-remaster',
  };
  return map[d] ?? '';
}


</script>

<style scoped>
.song-row {
  cursor: pointer;
  transition: background-color 0.1s;
  border-bottom: 1px solid var(--bg-hover);
}

.song-row:hover {
  background-color: var(--bg-hover);
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.badge-ap {
  background-color: rgba(255, 215, 0, 0.2);
  color: #ffd700;
}

.badge-fc {
  background-color: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.diff-basic { color: #22c55e; }
.diff-advanced { color: #f59e0b; }
.diff-expert { color: #ef4444; }
.diff-master { color: #8b5cf6; }
.diff-remaster { color: #ec4899; }
</style>
