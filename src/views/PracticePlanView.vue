<template>
  <div class="practice-plan p-4 overflow-y-auto h-full">
    <h1 class="text-lg font-bold text-text-primary mb-4">练习计划</h1>

    <div v-if="plans.length === 0" class="text-text-muted text-sm text-center py-12">
      暂无练习计划。<br/>可在 AI 教练面板中请求分析后保存推荐。
    </div>

    <div v-for="(plan, idx) in plans" :key="plan.id ?? idx" class="plan-card">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">创建于 {{ formatDate(plan.createdAt) }}</span>
        <button class="delete-btn" @click="deletePlan(plan.id!)">删除</button>
      </div>
      <div class="text-sm text-text-primary whitespace-pre-wrap mb-3">{{ plan.summary }}</div>
      <div v-if="plan.songs.length > 0" class="flex flex-wrap gap-2">
        <span
          v-for="s in plan.songs"
          :key="s.songId"
          class="song-chip"
          @click="goToSong(s.songId)"
        >
          {{ s.title }} ({{ s.constant?.toFixed(1) ?? '?' }})
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '@/services/db';

interface PracticePlanItem {
  id?: number;
  createdAt: string;
  summary: string;
  songs: Array<{ songId: number; title: string; constant: number | null }>;
}

const router = useRouter();
const plans = ref<PracticePlanItem[]>([]);

// Load plans from app_settings
onMounted(async () => {
  const setting = await db.appSettings.get('practice_plans');
  if (setting?.value) {
    try {
      plans.value = JSON.parse(setting.value);
    } catch { /* ignore */ }
  }
});

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

async function deletePlan(id: number) {
  plans.value = plans.value.filter(p => p.id !== id);
  await db.appSettings.put({
    key: 'practice_plans',
    value: JSON.stringify(plans.value),
    updatedAt: new Date().toISOString(),
  });
}

function goToSong(songId: number) {
  router.push(`/song/${songId}`);
}
</script>

<style scoped>
.plan-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.song-chip {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  background-color: var(--bg-card);
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}

.song-chip:hover {
  background-color: var(--bg-hover);
}

.delete-btn {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid var(--bg-hover);
  background-color: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.delete-btn:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
</style>
