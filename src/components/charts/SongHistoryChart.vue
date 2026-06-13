<template>
  <div class="svg-chart-wrap">
    <p v-if="records.length === 0" class="empty-text">暂无该曲目的游玩记录</p>
    <template v-else>
      <svg
        class="trend-svg"
        :viewBox="`0 0 ${vw} ${vh}`"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Y 轴刻度 + 网格线 -->
        <template v-for="y in yTicks" :key="'y-'+y">
          <line
            :x1="padL" :y1="yToSvg(y)" :x2="vw - padR" :y2="yToSvg(y)"
            stroke="rgba(139,155,180,0.12)" stroke-width="0.5"
          />
          <text
            :x="padL - 6" :y="yToSvg(y) + 4"
            text-anchor="end" class="svg-tick-label"
          >{{ y.toFixed(1) }}%</text>
        </template>

        <!-- X 轴标签 -->
        <text
          v-for="(label, i) in xLabels"
          :key="'xl-'+i"
          :x="xToSvg(i)" :y="vh - 4"
          text-anchor="middle" class="svg-tick-label"
        >{{ label }}</text>

        <!-- 达成率折线 -->
        <polyline
          v-if="linePoints"
          :points="linePoints"
          fill="none"
          stroke="url(#lineGrad)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 数据点 -->
        <circle
          v-for="(r, i) in records"
          :key="'dot-'+i"
          :cx="xToSvg(i)" :cy="yToSvg(r.achievements)" r="4.5"
          :fill="dotColor(r.achievements)"
          stroke="white" stroke-width="2"
          class="data-dot"
          @mouseenter="hoverIdx = i"
          @mouseleave="hoverIdx = -1"
        />
      </svg>

      <!-- 悬浮提示卡片 -->
      <div v-if="hoverIdx >= 0 && records[hoverIdx]" class="chart-tooltip" :style="tooltipStyle">
        <div class="tip-row"><span class="tip-label">第{{ hoverIdx + 1 }}次</span></div>
        <div class="tip-row"><span class="tip-label">达成率</span><span class="tip-val">{{ records[hoverIdx].achievements.toFixed(4) }}%</span></div>
        <div class="tip-row"><span class="tip-label">DX 分数</span><span class="tip-val">{{ records[hoverIdx].dxScore }}</span></div>
        <div class="tip-row" v-if="records[hoverIdx].dxRating != null">
          <span class="tip-label">DX Rating</span><span class="tip-val">{{ records[hoverIdx].dxRating }}</span>
        </div>
        <div class="tip-row"><span class="tip-label">评级</span><span class="tip-val rate-tag">{{ records[hoverIdx].rate || '-' }}</span></div>
        <div class="tip-row"><span class="tip-label">连击</span><span class="tip-val">{{ fcLabel(records[hoverIdx].fcStatus) }}</span></div>
      </div>
    </template>

    <!-- 隐藏的渐变定义 -->
    <svg width="0" height="0" aria-hidden="true">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#4A72FF" />
          <stop offset="100%" stop-color="#9D7BFF" />
        </linearGradient>
      </defs>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PlayRecord } from '@/types/playRecord';

const props = defineProps<{ records: PlayRecord[] }>();
const hoverIdx = ref(-1);

// SVG 坐标常量
const vw = 600, vh = 220;
const padL = 48, padR = 16, padT = 16, padB = 28;
const plotW = vw - padL - padR;
const plotH = vh - padT - padB;

const yMin = computed(() => {
  if (props.records.length === 0) return 0;
  return Math.floor(Math.min(...props.records.map(r => r.achievements)) - 1);
});
const yMax = computed(() => {
  if (props.records.length === 0) return 101;
  return Math.min(101, Math.ceil(Math.max(...props.records.map(r => r.achievements)) + 1));
});

const yTicks = computed(() => {
  const rng = yMax.value - yMin.value;
  const step = rng <= 3 ? 0.5 : (rng <= 6 ? 1 : 2);
  const ticks: number[] = [];
  for (let v = Math.ceil(yMin.value / step) * step; v <= yMax.value; v += step) {
    ticks.push(Math.round(v * 10) / 10);
  }
  return ticks;
});

const xLabels = computed(() => {
  const n = props.records.length;
  if (n <= 10) return props.records.map((_, i) => `#${i + 1}`);
  const step = Math.ceil(n / 8);
  return props.records.map((_, i) => (i % step === 0 || i === n - 1) ? `#${i + 1}` : '');
});

function xToSvg(i: number) {
  if (props.records.length <= 1) return padL + plotW / 2;
  return padL + (i / (props.records.length - 1)) * plotW;
}
function yToSvg(v: number) {
  const range = yMax.value - yMin.value || 1;
  return padT + plotH * (1 - (v - yMin.value) / range);
}

const linePoints = computed(() =>
  props.records.map((r, i) => `${xToSvg(i)},${yToSvg(r.achievements)}`).join(' ')
);

function dotColor(ach: number): string {
  const best = props.records.length > 0 ? Math.max(...props.records.map(r => r.achievements)) : 100;
  if (ach >= best) return '#10B981';
  if (ach >= 100.5) return '#F59E0B';
  if (ach >= 100) return '#8B5CF6';
  if (ach >= 99) return '#4A72FF';
  if (ach >= 97) return '#06B6D4';
  return '#8B9BB4';
}

function fcLabel(fc: string): string {
  return ({ ap: 'AP', fcp: 'FC+', fc: 'FC' }[fc] ?? fc) || '-';
}

const tooltipStyle = computed(() => {
  if (hoverIdx.value < 0) return { display: 'none' };
  const x = xToSvg(hoverIdx.value);
  const pct = ((x - padL) / plotW) * 100;
  return { left: `calc(${pct}% + ${(padL / vw) * 100}%)`, display: 'flex' };
});
</script>

<style scoped>
.svg-chart-wrap { position: relative; width: 100%; height: 100%; min-height: 200px; }
.trend-svg { width: 100%; height: 100%; display: block; }
.svg-tick-label { font-size: 9px; fill: #8B9BB4; font-family: 'Inter', -apple-system, sans-serif; }
.data-dot { cursor: pointer; transition: r 0.2s ease; }
.data-dot:hover { r: 6.5; }

.chart-tooltip {
  position: absolute; top: 4px; transform: translateX(-50%);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.7);
  border-radius: 12px; padding: 8px 12px;
  flex-direction: column; gap: 3px;
  box-shadow: 0 6px 24px rgba(44,76,160,0.1);
  z-index: 10; pointer-events: none; white-space: nowrap;
}
.tip-row { display: flex; align-items: center; gap: 10px; font-size: 11px; }
.tip-label { color: #8B9BB4; min-width: 48px; }
.tip-val { color: #111827; font-weight: 700; }
.rate-tag { padding: 1px 6px; border-radius: 4px; background: rgba(74,114,255,0.1); color: #4A72FF; font-weight: 700; }

.empty-text {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 13px;
}
</style>
