<template>
  <div class="radar-wrap">
    <div ref="chartEl" class="radar-box" :style="{ height: height + 'px' }" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import type { AbilityDimension } from '@/types/b50Analysis';

const props = withDefaults(defineProps<{
  dimensions: AbilityDimension[];
  height?: number;
  /** 对比线（例如「上一版分析」），同长度同顺序 */
  compare?: number[] | null;
}>(), {
  height: 260,
  compare: null,
});

const chartEl = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

/** 轴名外偏移 + 一行字高，纵向至少要留这么多余量 */
const LABEL_MARGIN_V = 34;
/** 横向余量：轴名外偏移 + 4 个汉字的宽度 */
const LABEL_MARGIN_H = 56;
/** 6 轴雷达左右两侧轴的水平投影系数 sin(60°) */
const COS60 = 0.866;

/**
 * 反推一个不会被容器裁掉标签的雷达半径。
 *
 * echarts 把 `axisName` 画在轴末端**再往外**偏移约 16px。radius 取
 * `min(w,h)/2` 的固定百分比（原本写死 78%）时，上下两轴的余量只剩 `(1-0.78)*h/2`，
 * 放不下 16px 偏移 + 11px 字高 → 最上方的「底力」与最下方的「广度」会被切掉半截甚至完全看不见。
 * 容器越扁越明显，所以这里按实际尺寸反推，并同时约束横竖两个方向。
 */
function safeRadius(): string {
  const el = chartEl.value;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight || props.height || 0;
  if (!w || !h) return '62%';

  const half = Math.min(w, h) / 2;
  const rV = (h / 2 - LABEL_MARGIN_V) / half;
  const rW = (w / 2 - LABEL_MARGIN_H) / (COS60 * half);
  const r = Math.max(0.35, Math.min(0.82, rV, rW));
  return `${(r * 100).toFixed(1)}%`;
}

function buildOption(): echarts.EChartsOption {
  const dims = props.dimensions;
  const indicators = dims.map(d => ({ name: d.label, max: 100 }));
  const values = dims.map(d => d.score);

  const series: echarts.RadarSeriesOption[] = [
    {
      type: 'radar',
      symbolSize: 5,
      lineStyle: { width: 2, color: '#4A72FF' },
      itemStyle: { color: '#4A72FF', borderColor: '#fff', borderWidth: 1.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(74,114,255,0.30)' },
          { offset: 1, color: 'rgba(157,123,255,0.14)' },
        ]),
      },
      data: [{ value: values, name: '当前 B50' }],
      emphasis: { lineStyle: { width: 3 } },
    },
  ];

  if (props.compare && props.compare.length === dims.length) {
    series.push({
      type: 'radar',
      symbolSize: 4,
      lineStyle: { width: 1.5, color: '#94A3B8', type: 'dashed' },
      itemStyle: { color: '#94A3B8' },
      areaStyle: { color: 'rgba(148,163,184,0.10)' },
      data: [{ value: props.compare, name: '对比' }],
    });
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'rgba(74,114,255,0.25)',
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: '#1E293B', fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 30px rgba(44,76,160,0.12);',
      formatter: () => {
        const rows = dims.map(d => {
          const bar = '█'.repeat(Math.max(1, Math.round(d.score / 12)));
          return `<div style="display:flex;gap:8px;align-items:center;line-height:1.7">
            <span style="width:56px;color:#64748B">${d.label}</span>
            <b style="width:26px;text-align:right;color:#4A72FF">${d.score}</b>
            <span style="color:#CBD5E1;font-size:9px;letter-spacing:-1px">${bar}</span>
          </div>`;
        }).join('');
        return `<div style="font-weight:700;margin-bottom:6px;color:#111827">六维能力</div>${rows}`;
      },
    },
    radar: {
      center: ['50%', '50%'],
      radius: safeRadius(),
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 4,
      axisName: {
        color: '#4B5563',
        fontSize: 11,
        fontWeight: 600,
        padding: [2, 3],
      },
      splitLine: { lineStyle: { color: 'rgba(74,114,255,0.13)' } },
      splitArea: {
        areaStyle: {
          color: ['rgba(74,114,255,0.015)', 'rgba(74,114,255,0.045)'],
        },
      },
      axisLine: { lineStyle: { color: 'rgba(74,114,255,0.18)' } },
    },
    series,
  };
}

let lastW = 0;
let lastH = 0;
let rafId = 0;

function render() {
  const el = chartEl.value;
  if (!el) return;
  if (!chart) chart = echarts.init(el);
  lastW = el.clientWidth;
  lastH = el.clientHeight;
  chart.setOption(buildOption(), true);
}

/**
 * 容器尺寸变了要**重算 option**，不能只调 `chart.resize()`。
 * 半径是按容器尺寸反推的，只 resize 会沿用旧百分比 ——
 * 容器从「扁」变「方」时横向上又会切到两侧轴标签。
 * 用 rAF 合并连续变化（侧栏折叠的 width 过渡会连打几十帧）。
 */
function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const el = chartEl.value;
    if (!el) return;
    if (el.clientWidth === lastW && el.clientHeight === lastH) return;
    render();
  });
}

let ro: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();
  render();
  window.addEventListener('resize', scheduleRender);
  // echarts 只监听 window.resize —— 容器自身宽度变化不会触发重绘。
  // 侧栏折叠/展开、容器查询降级、flex 重新分配宽度都属于这一类，
  // 表现是 canvas 宽度恒为 0（图表整片空白），且永远不会自愈。
  if (typeof ResizeObserver !== 'undefined' && chartEl.value) {
    ro = new ResizeObserver(scheduleRender);
    ro.observe(chartEl.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleRender);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  ro?.disconnect();
  ro = null;
  chart?.dispose();
  chart = null;
});

watch(() => [props.dimensions, props.compare], async () => {
  await nextTick();
  render();
}, { deep: true });
</script>

<style scoped>
.radar-wrap { width: 100%; }
.radar-box { width: 100%; }
</style>
