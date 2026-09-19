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
      // 容器通常很宽而矮，半径受高度约束 → 用较大的百分比把图撑满，
      // 同时给上下两个轴标签各留出约 14px 余量（再大就会切到「底力」/「广度」）
      radius: '78%',
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

function render() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  chart.setOption(buildOption(), true);
}

function resize() { chart?.resize(); }

onMounted(async () => {
  await nextTick();
  render();
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
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
