<template>
  <div class="b50-grid-container">
    <p v-if="!cards.length" class="empty-text">暂无 B50 数据，请先同步</p>

    <template v-else>
      <div class="b50-section">
        <div class="section-head">
          <span class="section-badge new-badge">B15</span>
          <span class="section-sub">DX 谱面 · Top {{ b15.length }}</span>
          <span class="section-total">合计 {{ b15Total }}</span>
        </div>
        <div class="b50-grid">
          <B50Card v-for="card in b15" :key="card.songId + '_' + card.difficulty" :card="card" />
        </div>
      </div>
      <div class="b50-section">
        <div class="section-head">
          <span class="section-badge old-badge">B35</span>
          <span class="section-sub">旧版本歌曲 · Top {{ b35.length }}</span>
          <span class="section-total">合计 {{ b35Total }}</span>
        </div>
        <div class="b50-grid">
          <B50Card v-for="card in b35" :key="card.songId + '_' + card.difficulty" :card="card" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useB50Store } from '@/stores/useB50Store';
import { getCoverUrl } from '@/types/sync';
import type { B50Record } from '@/types/b50';
import B50Card from './B50Card.vue';

const b50Store = useB50Store();

interface CardData extends B50Record { coverUrl: string; }

const cards = ref<CardData[]>([]);
const b15 = ref<CardData[]>([]);
const b35 = ref<CardData[]>([]);
const b15Total = ref('');
const b35Total = ref('');

async function load() {
  await b50Store.loadFromDB();
  const list = [...b50Store.b50List]
    .sort((a, b) => (b.ratingContribution || 0) - (a.ratingContribution || 0));

  const enriched: CardData[] = list.map(c => ({ ...c, coverUrl: getCoverUrl(c.songId) }));
  cards.value = enriched;

  // Split: isNew → B15 (current version), !isNew → B35 (old versions)
  b15.value = enriched.filter(c => c.isNew).slice(0, 15);
  b35.value = enriched.filter(c => !c.isNew).slice(0, 35);

  b15Total.value = b15.value.reduce((s, c) => s + (c.ratingContribution || 0), 0).toFixed(0);
  b35Total.value = b35.value.reduce((s, c) => s + (c.ratingContribution || 0), 0).toFixed(0);
}

onMounted(load);
watch(() => b50Store.b50List.length, () => load());
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
