<template>
  <div class="growth-page">
    <header class="growth-hero">
      <div class="hero-orb orb-a" />
      <div class="hero-orb orb-b" />
      <div class="hero-copy">
        <span class="eyebrow">GROWTH LAB</span>
        <h1>成长复盘</h1>
        <p>把每次 B50 存下来，看清这段时间是在延续强项，还是在补弱项。</p>
      </div>
      <nav class="seg" role="tablist" aria-label="复盘视图">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="seg-btn"
          :class="{ active: tab === t.key }"
          role="tab"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          <span class="seg-label">{{ t.label }}</span>
          <span class="seg-sub">{{ t.sub }}</span>
        </button>
      </nav>
    </header>

    <KeepAlive>
      <component :is="activeComp" />
    </KeepAlive>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EvolutionPanel from '@/components/growth/EvolutionPanel.vue';
import SelectionPanel from '@/components/growth/SelectionPanel.vue';

type TabKey = 'evolution' | 'selection';

const TABS: { key: TabKey; label: string; sub: string }[] = [
  { key: 'evolution', label: 'B50 演进', sub: '上一次 → 这一次' },
  { key: 'selection', label: '选曲复盘', sub: '3–16 首专项' },
];

const tab = ref<TabKey>('evolution');
const activeComp = computed(() => (tab.value === 'evolution' ? EvolutionPanel : SelectionPanel));
</script>

<style scoped>
.growth-page {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}

.growth-hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
  padding: 26px 28px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.92) 0%, rgba(238, 242, 255, 0.9) 52%, rgba(243, 238, 255, 0.92) 100%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow-card);
}

.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  pointer-events: none;
}
.orb-a {
  width: 260px; height: 260px; right: 12%; top: -150px;
  background: radial-gradient(circle, rgba(74, 114, 255, 0.18), transparent 68%);
}
.orb-b {
  width: 220px; height: 220px; right: -60px; bottom: -140px;
  background: radial-gradient(circle, rgba(157, 123, 255, 0.20), transparent 68%);
}

.hero-copy { position: relative; z-index: 1; }
.eyebrow {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: var(--color-primary);
}
.hero-copy h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--text-primary);
  margin: 6px 0 6px;
  line-height: 1.15;
}
.hero-copy p {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.seg {
  position: relative;
  z-index: 1;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 16px rgba(44, 76, 160, 0.05);
}
.seg-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 9px 18px;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: background var(--transition-smooth), box-shadow var(--transition-smooth),
              color var(--transition-smooth);
}
.seg-label { font-size: 12.5px; font-weight: 700; color: var(--text-secondary); }
.seg-sub { font-size: 9.5px; color: var(--text-muted); }
.seg-btn:hover:not(.active) { background: rgba(255, 255, 255, 0.85); }
.seg-btn.active {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  box-shadow: 0 4px 14px rgba(74, 114, 255, 0.28);
}
.seg-btn.active .seg-label { color: #fff; }
.seg-btn.active .seg-sub { color: rgba(255, 255, 255, 0.78); }

@media (max-width: 760px) {
  .growth-page { padding: 14px; gap: 14px; }
  .growth-hero { padding: 20px; }
  .hero-copy h1 { font-size: 22px; }
  .seg { width: 100%; }
  .seg-btn { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .seg-btn { transition: none; }
}
</style>
