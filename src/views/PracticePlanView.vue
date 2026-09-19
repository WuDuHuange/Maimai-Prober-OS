<template>
  <div class="practice-plan p-6 overflow-y-auto h-full">
    <div class="plan-header">
      <button class="back-btn" @click="emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        返回
      </button>
      <h1 class="text-lg font-bold text-text-primary">练习计划</h1>
      <span v-if="plans.length" class="count-tag">{{ plans.length }}</span>
    </div>

    <div v-if="plans.length === 0" class="empty-hint">
      暂无练习计划。<br />
      到「AI复盘」页生成能力分析，再点回复卡片上的「保存为练习计划」。
    </div>

    <div v-for="(plan, idx) in plans" :key="plan.id ?? idx" class="plan-card">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">创建于 {{ formatDate(plan.createdAt) }}</span>
        <button class="delete-btn" @click="deletePlan(plan.id!)">删除</button>
      </div>
      <div class="text-sm text-text-primary whitespace-pre-wrap mb-3">{{ plan.summary }}</div>
      <div v-if="plan.songs?.length" class="flex flex-wrap gap-2">
        <span
          v-for="s in plan.songs"
          :key="s.songId"
          class="song-chip"
          @click="emit('select-song', s.songId)"
        >
          {{ s.title }}<span class="chip-const">{{ s.constant?.toFixed(1) ?? '?' }}</span>
        </span>
      </div>
      <p v-else class="text-xs text-text-muted">（该计划未从 AI 回复中识别到具体曲目）</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db } from '@/services/db';

interface PracticePlanItem {
  id?: number;
  createdAt: string;
  summary: string;
  songs: Array<{ songId: number; title: string; constant: number | null }>;
}

const emit = defineEmits<{
  /** 点歌曲胶囊 → 由 App.vue 统一跳转到曲目详情 */
  'select-song': [songId: number];
  back: [];
}>();

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
  window.dispatchEvent(new CustomEvent('practice-plan-updated'));
}
</script>

<style scoped>
.plan-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background var(--transition-fast);
}

.back-btn:hover { background: rgba(74, 114, 255, 0.06); }

.count-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tag, rgba(74, 114, 255, 0.08));
  color: var(--color-primary);
}

.empty-hint {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.9;
  text-align: center;
  padding: 48px 0;
}

.plan-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.song-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  background-color: var(--bg-card);
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}

.song-chip:hover { background-color: var(--bg-hover); }

.chip-const {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
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
