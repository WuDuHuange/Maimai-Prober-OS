<template>
  <div class="b50-grid-container">
    <p v-if="!cards.length" class="empty-text">暂无 B50 数据，请先同步</p>

    <div v-else class="b50-grid">
      <div
        v-for="card in cards"
        :key="card.songId + '_' + card.difficulty"
        class="b50-card"
        @mouseenter="hovered = card.songId + '_' + card.difficulty"
        @mouseleave="hovered = null"
      >
        <!-- Cover background -->
        <img
          :src="card.coverUrl"
          class="card-bg"
          loading="lazy"
          @error="e => (e.target as HTMLImageElement).style.opacity = '0'"
        />

        <!-- Dark gradient overlay at bottom -->
        <div class="card-overlay" />

        <!-- Top-left: Difficulty badge -->
        <div class="card-badge" :class="'badge-' + card.difficulty">
          <span class="badge-diff">{{ diffLabel(card.difficulty) }}</span>
          <span class="badge-const">{{ card.constant?.toFixed(1) }}</span>
        </div>

        <!-- Rating contribution (top-right) -->
        <div class="card-rating">
          {{ card.ratingContribution?.toFixed(0) }}
        </div>

        <!-- Bottom: Achievement & Grade -->
        <div class="card-bottom">
          <div class="card-ach">{{ card.achievements.toFixed(4) }}%</div>
          <div class="card-grade" :class="gradeClass(card)">{{ gradeText(card) }}</div>
        </div>

        <!-- Hover overlay detail -->
        <Transition name="fade-up">
          <div v-if="hovered === card.songId + '_' + card.difficulty" class="card-detail">
            <div class="detail-title">{{ card.title }}</div>
            <div class="detail-artist" v-if="card.artist">{{ card.artist }}</div>
            <div class="detail-meta">
              <span class="detail-tag" :class="'badge-' + card.difficulty">
                {{ diffLabel(card.difficulty) }} {{ card.constant?.toFixed(1) }}
              </span>
              <span class="detail-tag">{{ gradeText(card) }}</span>
              <span v-if="card.fcStatus" class="detail-tag fc-tag">{{ fcLabel(card.fcStatus) }}</span>
            </div>
            <div class="detail-numbers">
              <div><span class="dn-label">Rating</span><span class="dn-val">{{ card.ratingContribution?.toFixed(1) }}</span></div>
              <div><span class="dn-label">达成率</span><span class="dn-val">{{ card.achievements.toFixed(4) }}%</span></div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useB50Store } from '@/stores/useB50Store';
import { getCoverUrl } from '@/types/sync';
import type { B50Record } from '@/types/b50';

const b50Store = useB50Store();
const hovered = ref<string | null>(null);

const DIFF_LABELS: Record<string, string> = {
  basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM',
};

interface CardData extends B50Record {
  coverUrl: string;
}

const cards = ref<CardData[]>([]);

async function load() {
  await b50Store.loadFromDB();
  const list = [...b50Store.b50List]
    .sort((a, b) => (b.ratingContribution || 0) - (a.ratingContribution || 0))
    .slice(0, 50);

  cards.value = list.map(c => ({
    ...c,
    coverUrl: getCoverUrl(c.songId),
  }));
}

function diffLabel(d: string) { return DIFF_LABELS[d] || d; }

function gradeText(c: B50Record): string {
  const a = c.achievements;
  if (a >= 100.5) return 'SSS+';
  if (a >= 100.0) return 'SSS';
  if (a >= 99.5) return 'SS+';
  if (a >= 99.0) return 'SS';
  if (a >= 98.0) return 'S+';
  if (a >= 97.0) return 'S';
  if (a >= 94.0) return 'AAA';
  if (a >= 90.0) return 'AA';
  if (a >= 80.0) return 'A';
  return 'B';
}

function gradeClass(c: B50Record): string {
  const a = c.achievements;
  if (a >= 100.5) return 'grade-sssp';
  if (a >= 100.0) return 'grade-sss';
  if (a >= 99.5) return 'grade-ssp';
  if (a >= 99.0) return 'grade-ss';
  if (a >= 98.0) return 'grade-sp';
  if (a >= 97.0) return 'grade-s';
  return 'grade-norm';
}

function fcLabel(fc: string): string {
  const m: Record<string, string> = { ap: 'AP', fcp: 'FC+', fc: 'FC', clear: 'CLEAR' };
  return m[fc] || fc.toUpperCase();
}

onMounted(load);
watch(() => b50Store.b50List.length, () => load());
</script>

<style scoped>
.b50-grid-container {
  width: 100%;
  min-height: 200px;
}

.empty-text {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
  font-size: 13px;
}

/* ===== Grid ===== */
.b50-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

/* ===== Card ===== */
.b50-card {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.3s ease;
  box-shadow: 0 4px 16px rgba(44, 76, 160, 0.06);
}

.b50-card:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 40px rgba(44, 76, 160, 0.15);
  z-index: 5;
}

/* Cover background */
.card-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  transition: transform 0.4s ease, filter 0.4s ease;
  filter: brightness(0.65) saturate(0.8);
}

.b50-card:hover .card-bg {
  filter: brightness(0.35) saturate(0.6) blur(2px);
  transform: scale(1.05);
}

/* Bottom gradient overlay */
.card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 40%,
    rgba(0, 0, 0, 0.15) 65%,
    rgba(0, 0, 0, 0.75) 100%
  );
  pointer-events: none;
}

/* ===== Difficulty Badge (top-left) ===== */
.card-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  color: white;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.15);
  letter-spacing: 0.03em;
}

.badge-diff {
  opacity: 0.9;
}

.badge-const {
  opacity: 0.75;
  font-weight: 500;
  font-size: 9px;
}

/* Difficulty accent line on left of badge */
.card-badge::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 2px;
}

.badge-basic::before  { background: #10B981; }
.badge-advanced::before { background: #F59E0B; }
.badge-expert::before  { background: #EF4444; }
.badge-master::before  { background: #8B5CF6; }
.badge-remaster::before { background: #EC4899; }

/* ===== Rating Number (top-right) ===== */
.card-rating {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 18px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  letter-spacing: -0.02em;
}

/* ===== Bottom Info ===== */
.card-bottom {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-ach {
  font-size: 13px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  letter-spacing: -0.01em;
}

.card-grade {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
  width: fit-content;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: white;
  letter-spacing: 0.05em;
}

.grade-sssp { background: rgba(236, 72, 153, 0.6); }
.grade-sss  { background: rgba(139, 92, 246, 0.55); }
.grade-ssp  { background: rgba(99, 102, 241, 0.55); }
.grade-ss   { background: rgba(74, 114, 255, 0.55); }
.grade-sp   { background: rgba(16, 185, 129, 0.55); }
.grade-s    { background: rgba(245, 158, 11, 0.5); }
.grade-norm { background: rgba(107, 114, 128, 0.4); }

/* ===== Hover Detail Overlay ===== */
.card-detail {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px;
  gap: 8px;
  text-align: center;
}

.detail-title {
  font-size: 13px;
  font-weight: 700;
  color: white;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.detail-artist {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.detail-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.fc-tag {
  background: rgba(74, 222, 128, 0.25);
  color: #4ade80;
}

.detail-numbers {
  display: flex;
  gap: 16px;
}

.dn-label {
  display: block;
  font-size: 8px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dn-val {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: white;
}

/* ===== Transitions ===== */
.fade-up-enter-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.95);
}
.fade-up-leave-to {
  opacity: 0;
}
</style>
