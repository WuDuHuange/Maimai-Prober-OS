<template>
  <div class="b50-grid-container">
    <p v-if="!b50Store.b50List.length" class="empty-text">暂无 B50 数据，请先同步</p>

    <template v-else>
      <div class="b50-section">
        <div class="section-head">
          <span class="section-badge new-badge">B15</span>
          <span class="section-sub">DX 谱面 · Top {{ b15.length }}</span>
          <span class="section-total">{{ b15Total }}</span>
        </div>
        <div class="b50-grid">
          <B50Card
            v-for="(card, i) in b15"
            :key="card.songId + '_' + card.difficulty"
            :card="card"
            :enter-delay="i"
          />
        </div>
      </div>
      <div class="b50-section">
        <div class="section-head">
          <span class="section-badge old-badge">B35</span>
          <span class="section-sub">旧版本歌曲 · Top {{ b35.length }}</span>
          <span class="section-total">{{ b35Total }}</span>
        </div>
        <div class="b50-grid">
          <B50Card
            v-for="(card, i) in b35"
            :key="card.songId + '_' + card.difficulty"
            :card="card"
            :enter-delay="i"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useB50Store } from '@/stores/useB50Store';
import { getCoverUrl } from '@/types/sync';
import type { B50Record } from '@/types/b50';
import B50Card from './B50Card.vue';

const b50Store = useB50Store();
const { b15List, b35List, b15Total: b15TotalRaw, b35Total: b35TotalRaw } = storeToRefs(b50Store);

interface CardData extends B50Record { coverUrl: string; }

const coverMap = ref<Record<string, string>>({});

const decorate = (list: B50Record[]): CardData[] =>
  list.map(c => {
    const key = c.songId + '_' + c.difficulty;
    if (!coverMap.value[key]) coverMap.value[key] = getCoverUrl(c.songId);
    return { ...c, coverUrl: coverMap.value[key] };
  });

const b15 = computed(() => decorate(b15List.value));
const b35 = computed(() => decorate(b35List.value));
const b15Total = computed(() => (b15TotalRaw.value || 0).toFixed(0));
const b35Total = computed(() => (b35TotalRaw.value || 0).toFixed(0));

onMounted(() => { b50Store.loadFromDB(); });
</script>

<style scoped>
.b50-grid-container { width: 100%; min-height: 200px; }

.empty-text {
  display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--text-muted); font-size: 13px;
}

.b50-section { margin-bottom: 24px; }
.b50-section:last-child { margin-bottom: 0; }

.section-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; padding: 0 2px;
}

.section-badge {
  font-size: 12px; font-weight: 800; padding: 4px 12px;
  border-radius: 8px; letter-spacing: 0.03em;
}

.new-badge {
  background: linear-gradient(135deg, #8B5CF6, #A78BFA);
  color: white; box-shadow: 0 2px 10px rgba(139,92,246,0.25);
}

.old-badge {
  background: linear-gradient(135deg, #4A72FF, #6B8CFF);
  color: white; box-shadow: 0 2px 10px rgba(74,114,255,0.25);
}

.section-sub { font-size: 11px; color: var(--text-muted); font-weight: 500; }

.section-total {
  margin-left: auto; font-size: 15px; font-weight: 800;
  color: var(--text-primary); letter-spacing: -0.02em;
}

.b50-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
</style>
