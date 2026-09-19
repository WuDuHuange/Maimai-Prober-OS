<template>
  <div v-if="tags.length > 0" class="tag-chips" :class="size">
    <span
      v-for="t in visible"
      :key="t.id"
      class="chip"
      :style="chipStyle(t)"
      :title="t.description ? `${t.nameEn} · ${t.description}` : t.nameEn"
    >
      {{ t.name }}
    </span>
    <span v-if="hiddenCount > 0" class="chip chip-more" :title="hiddenTitle">
      +{{ hiddenCount }}
    </span>
  </div>
  <span v-else-if="showEmpty" class="tag-empty">{{ emptyText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChartTag } from '@/types/tag';

const props = withDefaults(defineProps<{
  tags: ChartTag[];
  /** 最多显示几个，超出折叠成 +N */
  max?: number;
  size?: 'sm' | 'md';
  /** 无 tag 时是否显示占位文案 */
  showEmpty?: boolean;
  emptyText?: string;
}>(), {
  max: 8,
  size: 'sm',
  showEmpty: false,
  emptyText: '暂无标注',
});

const visible = computed(() => props.tags.slice(0, props.max));
const hiddenCount = computed(() => Math.max(0, props.tags.length - props.max));
const hiddenTitle = computed(() =>
  props.tags.slice(props.max).map(t => t.name).join('、')
);

/** 用分组色做底 —— 配置/难度/评价三组视觉上可区分 */
function chipStyle(t: ChartTag) {
  const c = t.groupColor || '#94A3B8';
  return {
    color: shade(c, -0.35),
    backgroundColor: withAlpha(c, 0.13),
    borderColor: withAlpha(c, 0.28),
  };
}

/** hex → rgba */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(148,163,184,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 加深颜色，保证浅底上的文字对比度 */
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return '#475569';
  const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  const r = adj((n >> 16) & 255), g = adj((n >> 8) & 255), b = adj(n & 255);
  return `rgb(${r},${g},${b})`;
}
</script>

<style scoped>
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transition: transform var(--transition-fast), filter var(--transition-fast);
}

.chip:hover { transform: translateY(-1px); filter: brightness(0.97); }

.tag-chips.sm .chip { font-size: 10px; padding: 3px 8px; }
.tag-chips.md .chip { font-size: 12px; padding: 5px 11px; }

.chip-more {
  background: rgba(148, 163, 184, 0.14) !important;
  color: #64748B !important;
  border-color: rgba(148, 163, 184, 0.28) !important;
  cursor: help;
}

.tag-empty {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
